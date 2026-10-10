import { describe, expect, it } from "vitest";

import {
  createOrganization,
  createSessionCookie,
  createUser,
  startApi,
  testPassword,
} from "../../test/api.ts";
import { pool } from "../db/pool.ts";
import { cookieName } from "./session.ts";

const api = await startApi();

// Sign-in through HTTP, keeping the Set-Cookie header the helpers hide.
async function login(email: string, password: string) {
  const response = await fetch(api.url("/auth/login"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const setCookie = response.headers.get("set-cookie");
  return {
    status: response.status,
    body: (await response.json()) as unknown,
    setCookie,
    // What a browser would send back: "name=value" from the Set-Cookie line.
    cookie: setCookie?.split(";")[0] ?? null,
  };
}

describe("POST /auth/login", () => {
  it("signs in and sets an HttpOnly session cookie", async () => {
    const res = await login(api.user.email, testPassword);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      user: {
        id: api.user.id,
        organizationId: api.organizationId,
        email: api.user.email,
        name: "Test User",
      },
      organization: {
        id: api.organizationId,
        name: "Test Organization",
        timezone: "America/Toronto",
      },
    });
    expect(res.setCookie).toMatch(
      new RegExp(
        `^${cookieName}=[A-Za-z0-9_-]{43}; Path=/; Expires=.*; HttpOnly; SameSite=Lax$`,
      ),
    );
    const me = await api.get("/auth/me", { cookie: res.cookie });
    expect(me.status).toBe(200);
  });

  it("ignores the case of the email", async () => {
    const res = await login(api.user.email.toUpperCase(), testPassword);

    expect(res.status).toBe(200);
  });

  it("answers 401 with the same message for a wrong password and an unknown email", async () => {
    const wrongPassword = await login(api.user.email, "not the password");
    const unknownEmail = await login("nobody@example.com", testPassword);

    for (const res of [wrongPassword, unknownEmail]) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        error: {
          code: "invalid_credentials",
          message: "Invalid email or password",
        },
      });
      expect(res.setCookie).toBeNull();
    }
  });

  it("answers 400 for a malformed request", async () => {
    const res = await api.post("/auth/login", { email: "not-an-email" });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: {
        code: "validation_error",
        issues: [{ path: "email" }, { path: "password" }],
      },
    });
  });

  it("answers 429 after ten attempts on one email", async () => {
    const email = `target-${api.organizationId}@example.com`;
    for (let attempt = 0; attempt < 10; attempt++) {
      expect((await login(email, "guess")).status).toBe(401);
    }

    const res = await login(email, "guess");

    expect(res.status).toBe(429);
    expect(res.body).toEqual({
      error: {
        code: "too_many_requests",
        message: "Too many attempts, try again later",
      },
    });
    // Other accounts are not affected.
    expect((await login(api.user.email, testPassword)).status).toBe(200);
  });
});

describe("GET /auth/me", () => {
  it("returns the user and the organization of the session", async () => {
    const res = await api.get("/auth/me");

    expect(res).toEqual({
      status: 200,
      body: {
        user: {
          id: api.user.id,
          organizationId: api.organizationId,
          email: api.user.email,
          name: "Test User",
        },
        organization: {
          id: api.organizationId,
          name: "Test Organization",
          timezone: "America/Toronto",
        },
      },
    });
  });

  it("answers 401 without a session, with an unknown token, or with an expired one", async () => {
    const expired = `${cookieName}=expired-token`;
    const organizationId = await createOrganization();
    const user = await createUser(
      organizationId,
      `expired-${organizationId}@example.com`,
    );
    const cookie = await createSessionCookie(user);
    await pool.query(
      "UPDATE sessions SET expires_at = now() - interval '1 second' WHERE user_id = $1",
      [user.id],
    );

    const none = await api.get("/auth/me", { cookie: null });
    const unknown = await api.get("/auth/me", { cookie: expired });
    const stale = await api.get("/auth/me", { cookie });

    for (const res of [none, unknown, stale]) {
      expect(res).toEqual({
        status: 401,
        body: { error: { code: "unauthorized", message: "Sign in required" } },
      });
    }
  });
});

describe("POST /auth/logout", () => {
  it("ends the session and clears the cookie", async () => {
    const signedIn = await login(api.user.email, testPassword);
    const cookie = signedIn.cookie;

    const response = await fetch(api.url("/auth/logout"), {
      method: "POST",
      headers: cookie === null ? {} : { cookie },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toMatch(
      new RegExp(`^${cookieName}=; Path=/; Expires=Thu, 01 Jan 1970`),
    );
    expect((await api.get("/auth/me", { cookie })).status).toBe(401);
    // The default session of the test file is untouched.
    expect((await api.get("/auth/me")).status).toBe(200);
  });

  it("answers 401 without a session", async () => {
    const res = await api.post("/auth/logout", undefined, { cookie: null });

    expect(res.status).toBe(401);
  });
});

describe("protected routes", () => {
  it("answer 401 without a session, and serve the user's organization with one", async () => {
    const organizationId = await createOrganization();
    const user = await createUser(
      organizationId,
      `other-${organizationId}@example.com`,
    );
    const cookie = await createSessionCookie(user);
    await api.post("/clients", { name: "Mine" });

    const anonymous = await api.get("/clients", { cookie: null });
    const mine = await api.get<{ name: string }[]>("/clients");
    const theirs = await api.get<{ name: string }[]>("/clients", { cookie });

    expect(anonymous.status).toBe(401);
    expect(mine.body.map((client) => client.name)).toEqual(["Mine"]);
    expect(theirs).toEqual({ status: 200, body: [] });
  });

  it("keep /health public", async () => {
    const res = await api.get("/health", { cookie: null });

    expect(res).toEqual({ status: 200, body: { status: "ok" } });
  });
});
