import { randomBytes } from "node:crypto";

import { Router } from "express";
import { rateLimit } from "express-rate-limit";

import { HttpError } from "../http/errors.ts";
import { hashPassword, needsRehash, verifyPassword } from "./password.ts";
import * as auth from "./repository.ts";
import { loginSchema } from "./schemas.ts";
import {
  clearSessionCookie,
  generateToken,
  hashToken,
  requireSession,
  sessionExpiry,
  setSessionCookie,
} from "./session.ts";

export const authRouter = Router();

const fifteenMinutes = 15 * 60 * 1000;

const tooManyAttempts = {
  windowMs: fifteenMinutes,
  standardHeaders: "draft-8" as const,
  legacyHeaders: false,
  handler: (_req: unknown, res: import("express").Response) => {
    res.status(429).json({
      error: {
        code: "too_many_requests",
        message: "Too many attempts, try again later",
      },
    });
  },
};

// A flood from one address, and a targeted guess at one account, are limited
// separately. Counters live in memory: one process for now.
const limitByAddress = rateLimit({ ...tooManyAttempts, limit: 100 });
const limitByEmail = rateLimit({
  ...tooManyAttempts,
  limit: 10,
  keyGenerator: (req) => {
    const email: unknown = req.body?.email;
    return typeof email === "string" ? email.trim().toLowerCase() : "";
  },
});

// Verifying against this when the email is unknown keeps the response time
// the same as for a wrong password, so timing does not reveal which emails
// have an account.
const unknownUserHash = hashPassword(randomBytes(16).toString("hex"));

authRouter.post("/login", limitByAddress, limitByEmail, async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const credentials = await auth.findCredentials(email);
  const valid =
    credentials === undefined
      ? !(await verifyPassword(password, await unknownUserHash))
      : await verifyPassword(password, credentials.passwordHash);
  if (credentials === undefined || !valid) {
    // One message for both cases: an attacker must not learn which emails exist.
    throw new HttpError(
      401,
      "invalid_credentials",
      "Invalid email or password",
    );
  }

  if (needsRehash(credentials.passwordHash)) {
    await auth.updatePasswordHash(credentials.id, await hashPassword(password));
  }
  await auth.deleteExpiredSessions();

  const token = generateToken();
  const expiresAt = sessionExpiry();
  await auth.createSession(
    credentials.organizationId,
    credentials.id,
    hashToken(token),
    expiresAt,
  );
  setSessionCookie(res, token, expiresAt);

  // The same shape as GET /auth/me.
  const session = await auth.findSessionUser(hashToken(token));
  if (session === undefined) {
    throw new Error("Expected the session that was just created");
  }
  res.json({ user: session.user, organization: session.organization });
});

authRouter.post("/logout", requireSession, async (_req, res) => {
  await auth.deleteSession(res.locals.sessionId);
  clearSessionCookie(res);
  res.status(204).end();
});

authRouter.get("/me", requireSession, (_req, res) => {
  res.json({ user: res.locals.user, organization: res.locals.organization });
});
