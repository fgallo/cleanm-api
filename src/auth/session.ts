// Session cookie: a random token in an HttpOnly cookie, its SHA-256 in the
// sessions table. Every request runs `authenticate`; routes that need a user
// add `requireSession`.
import { createHash, randomBytes } from "node:crypto";

import { parseCookie } from "cookie";
import type { RequestHandler, Response } from "express";

import { config } from "../config.ts";
import { UnauthorizedError } from "../http/errors.ts";
import * as sessions from "./repository.ts";
import type { Organization, User } from "./repository.ts";

declare global {
  namespace Express {
    interface Locals {
      // Set by `authenticate` for a signed-in request; `requireSession`
      // guarantees them for the routes after it.
      organizationId: string;
      organization: Organization;
      user: User;
      sessionId: string;
    }
  }
}

export const cookieName = "cleanm_session";
export const sessionDays = 30;

export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

export function sessionExpiry(from = new Date()): Date {
  return new Date(from.getTime() + sessionDays * 24 * 60 * 60 * 1000);
}

export function setSessionCookie(
  res: Response,
  token: string,
  expiresAt: Date,
): void {
  res.cookie(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    // Only over HTTPS in production; local development runs on plain HTTP.
    secure: config.production,
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(cookieName, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.production,
    path: "/",
  });
}

// Loads the user behind the session cookie, when there is one. Never fails:
// public routes run after it too.
export const authenticate: RequestHandler = async (req, res, next) => {
  const token = parseCookie(req.headers.cookie ?? "")[cookieName];
  if (token !== undefined) {
    const found = await sessions.findSessionUser(hashToken(token));
    if (found !== undefined) {
      res.locals.sessionId = found.sessionId;
      res.locals.user = found.user;
      res.locals.organization = found.organization;
      res.locals.organizationId = found.organization.id;
    }
  }
  next();
};

export const requireSession: RequestHandler = (_req, res, next) => {
  if (res.locals.user === undefined) {
    throw new UnauthorizedError();
  }
  next();
};
