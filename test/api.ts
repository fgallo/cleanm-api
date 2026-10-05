import { once } from "node:events";
import type { AddressInfo } from "node:net";

import { afterAll, beforeEach } from "vitest";

import { pool } from "../src/db/pool.ts";
import { single } from "../src/db/rows.ts";

export type ApiResponse<T> = { status: number; body: T };

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

// Jobs first, because a property with jobs cannot be deleted; deleting the
// clients then cascades to their properties.
async function deleteData(): Promise<void> {
  await pool.query("DELETE FROM jobs WHERE organization_id = ANY($1)", [
    organizationIds,
  ]);
  await pool.query("DELETE FROM clients WHERE organization_id = ANY($1)", [
    organizationIds,
  ]);
}

// Call once at the top of a test file. Starts the app on a free port, serving
// a new organization, and registers the hooks that keep tests independent.
export async function startApi() {
  const organizationId = await createOrganization();
  // src/config.ts reads ORGANIZATION_ID when it is first imported, so the app
  // can only be imported now.
  process.env.ORGANIZATION_ID = organizationId;
  const { app } = await import("../src/app.ts");

  const server = app.listen(0);
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://localhost:${port}`;

  beforeEach(deleteData);

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    await deleteData();
    await pool.query("DELETE FROM organizations WHERE id = ANY($1)", [
      organizationIds,
    ]);
    await pool.end();
  });

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<ApiResponse<T>> {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: body === undefined ? {} : { "content-type": "application/json" },
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
    // For requests the helpers below cannot express, such as a malformed body.
    url: (path: string) => `${baseUrl}${path}`,
    get: <T = unknown>(path: string) => request<T>("GET", path),
    post: <T = unknown>(path: string, body: unknown) =>
      request<T>("POST", path, body),
    patch: <T = unknown>(path: string, body: unknown) =>
      request<T>("PATCH", path, body),
    delete: <T = unknown>(path: string) => request<T>("DELETE", path),
  };
}
