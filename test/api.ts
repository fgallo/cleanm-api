import { once } from "node:events";
import type { AddressInfo } from "node:net";

import { afterAll, beforeEach } from "vitest";

import { app } from "../src/app.ts";
import { hashPassword } from "../src/auth/password.ts";
import * as auth from "../src/auth/repository.ts";
import {
  cookieName,
  generateToken,
  hashToken,
  sessionExpiry,
} from "../src/auth/session.ts";
import { pool } from "../src/db/pool.ts";
import { single } from "../src/db/rows.ts";

export type ApiResponse<T> = { status: number; body: T };

// Per request: a session cookie other than the default one, or none at all.
export type RequestOptions = { cookie?: string | null };

const organizationIds: string[] = [];

// Test data lives in organizations created by the test file itself, so files
// can run in parallel against the same database without seeing each other.
export async function createOrganization(): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    "INSERT INTO organizations (name, timezone) VALUES ($1, $2) RETURNING id",
    ["Test Organization", "America/Toronto"],
  );
  const { id } = single(rows);
  organizationIds.push(id);
  return id;
}

// The same password for every test user: hashing is slow on purpose.
export const testPassword = "correct horse battery staple";
const testPasswordHash = hashPassword(testPassword);

export async function createUser(
  organizationId: string,
  email: string,
  name = "Test User",
): Promise<auth.User> {
  return auth.createUser(organizationId, {
    email,
    name,
    passwordHash: await testPasswordHash,
  });
}

// A signed-in session for the user, without going through /auth/login.
export async function createSessionCookie(user: auth.User): Promise<string> {
  const token = generateToken();
  await auth.createSession(
    user.organizationId,
    user.id,
    hashToken(token),
    sessionExpiry(),
  );
  return `${cookieName}=${token}`;
}

// Jobs first, because a series, property or helper with jobs cannot be
// deleted; deleting the clients then cascades to their properties. Users and
// their sessions go with the organization.
async function deleteData(): Promise<void> {
  for (const table of ["jobs", "recurring_series", "clients", "helpers"]) {
    await pool.query(`DELETE FROM ${table} WHERE organization_id = ANY($1)`, [
      organizationIds,
    ]);
  }
}

// Call once at the top of a test file. Starts the app on a free port, with a
// new organization and a signed-in user, and registers the hooks that keep
// tests independent.
export async function startApi() {
  const organizationId = await createOrganization();
  const user = await createUser(
    organizationId,
    `user-${organizationId}@example.com`,
  );
  const sessionCookie = await createSessionCookie(user);

  const server = app.listen(0);
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://localhost:${port}`;

  beforeEach(deleteData);

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    await deleteData();
    for (const table of ["sessions", "users", "organizations"]) {
      await pool.query(
        `DELETE FROM ${table} WHERE ${table === "organizations" ? "id" : "organization_id"} = ANY($1)`,
        [organizationIds],
      );
    }
    await pool.end();
  });

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    options: RequestOptions = {},
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {};
    if (body !== undefined) {
      headers["content-type"] = "application/json";
    }
    const cookie =
      options.cookie === undefined ? sessionCookie : options.cookie;
    if (cookie !== null) {
      headers.cookie = cookie;
    }
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? null : JSON.stringify(body),
    });
    const text = await response.text();
    return {
      status: response.status,
      // A 204 has no body.
      body: (text === "" ? undefined : JSON.parse(text)) as T,
    };
  }

  return {
    organizationId,
    user,
    // For requests the helpers below cannot express, such as a malformed body.
    url: (path: string) => `${baseUrl}${path}`,
    get: <T = unknown>(path: string, options?: RequestOptions) =>
      request<T>("GET", path, undefined, options),
    post: <T = unknown>(
      path: string,
      body: unknown,
      options?: RequestOptions,
    ) => request<T>("POST", path, body, options),
    patch: <T = unknown>(
      path: string,
      body: unknown,
      options?: RequestOptions,
    ) => request<T>("PATCH", path, body, options),
    delete: <T = unknown>(path: string, options?: RequestOptions) =>
      request<T>("DELETE", path, undefined, options),
  };
}
