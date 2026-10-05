import { describe, expect, it } from "vitest";

import { createOrganization, startApi } from "../../test/api.ts";
import * as clients from "./repository.ts";

const api = await startApi();

const missingId = "00000000-0000-7000-8000-000000000000";

type ClientBody = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  createdAt: string;
  updatedAt: string;
};

async function createClient(input: object = {}): Promise<ClientBody> {
  const res = await api.post<ClientBody>("/clients", {
    name: "Jane Doe",
    ...input,
  });
  expect(res.status).toBe(201);
  return res.body;
}

// A client that exists, but in an organization the API is not serving.
async function createClientElsewhere(): Promise<string> {
  const other = await createOrganization();
  const client = await clients.createClient(other, { name: "Someone Else" });
  return client.id;
}

describe("POST /clients", () => {
  it("creates a client", async () => {
    const res = await api.post("/clients", {
      name: "Jane Doe",
      email: "jane@example.com",
      phone: "416-555-0100",
    });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      name: "Jane Doe",
      email: "jane@example.com",
      phone: "416-555-0100",
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });

  it("stores null for the optional fields left out", async () => {
    const client = await createClient({ name: "  Jane Doe  " });

    expect(client).toMatchObject({
      name: "Jane Doe",
      email: null,
      phone: null,
    });
  });

  it("answers 400 with one issue per invalid field", async () => {
    const res = await api.post("/clients", { email: "not-an-email" });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: {
        code: "validation_error",
        issues: [
          { path: "name", message: expect.any(String) },
          { path: "email", message: expect.any(String) },
        ],
      },
    });
  });
});

describe("GET /clients", () => {
  it("lists the clients ordered by name", async () => {
    await createClient({ name: "Zoe Young" });
    await createClient({ name: "Adam Brown" });

    const res = await api.get<ClientBody[]>("/clients");

    expect(res.status).toBe(200);
    expect(res.body.map((client) => client.name)).toEqual([
      "Adam Brown",
      "Zoe Young",
    ]);
  });

  it("does not list clients of another organization", async () => {
    await createClientElsewhere();

    const res = await api.get("/clients");

    expect(res).toEqual({ status: 200, body: [] });
  });
});

describe("GET /clients/:id", () => {
  it("returns the client", async () => {
    const client = await createClient();

    const res = await api.get(`/clients/${client.id}`);

    expect(res).toEqual({ status: 200, body: client });
  });

  it("answers 404 for a client that does not exist", async () => {
    const res = await api.get(`/clients/${missingId}`);

    expect(res).toEqual({
      status: 404,
      body: { error: { code: "not_found", message: "Client not found" } },
    });
  });

  it("answers 404 for a client of another organization", async () => {
    const id = await createClientElsewhere();

    const res = await api.get(`/clients/${id}`);

    expect(res.status).toBe(404);
  });

  it("answers 400 for an id that is not a UUID", async () => {
    const res = await api.get("/clients/not-a-uuid");

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: { code: "validation_error", issues: [{ path: "id" }] },
    });
  });
});

describe("PATCH /clients/:id", () => {
  it("updates only the fields sent", async () => {
    const client = await createClient({ email: "jane@example.com" });

    const res = await api.patch<ClientBody>(`/clients/${client.id}`, {
      phone: "416-555-0100",
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: client.id,
      name: "Jane Doe",
      email: "jane@example.com",
      phone: "416-555-0100",
    });
    expect(res.body.updatedAt > client.updatedAt).toBe(true);
  });

  it("clears a field set to null", async () => {
    const client = await createClient({ email: "jane@example.com" });

    const res = await api.patch(`/clients/${client.id}`, { email: null });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: null });
  });

  it("answers 400 for an empty patch", async () => {
    const client = await createClient();

    const res = await api.patch(`/clients/${client.id}`, {});

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: "validation_error" } });
  });

  it("answers 400 when a required field is set to null", async () => {
    const client = await createClient();

    const res = await api.patch(`/clients/${client.id}`, { name: null });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: { code: "validation_error", issues: [{ path: "name" }] },
    });
  });

  it("answers 404 for a client that does not exist", async () => {
    const res = await api.patch(`/clients/${missingId}`, { name: "Nobody" });

    expect(res.status).toBe(404);
  });

  it("does not update a client of another organization", async () => {
    const id = await createClientElsewhere();

    const res = await api.patch(`/clients/${id}`, { name: "Hijacked" });

    expect(res.status).toBe(404);
  });
});

describe("DELETE /clients/:id", () => {
  it("deletes the client", async () => {
    const client = await createClient();

    const res = await api.delete(`/clients/${client.id}`);

    expect(res).toEqual({ status: 204, body: undefined });
    expect((await api.get(`/clients/${client.id}`)).status).toBe(404);
  });

  it("answers 404 for a client that does not exist", async () => {
    const res = await api.delete(`/clients/${missingId}`);

    expect(res.status).toBe(404);
  });

  it("does not delete a client of another organization", async () => {
    const id = await createClientElsewhere();

    const res = await api.delete(`/clients/${id}`);

    expect(res.status).toBe(404);
  });

  it("answers 409 when the client has jobs, so history is kept", async () => {
    const client = await createClient();
    const property = await api.post<{ id: string }>(
      `/clients/${client.id}/properties`,
      {
        addressLine1: "123 Example St",
        city: "Toronto",
        province: "ON",
        postalCode: "M5V 0A1",
      },
    );
    const job = await api.post("/jobs", {
      propertyId: property.body.id,
      scheduledDate: "2026-10-14",
      startTime: "09:00",
      durationMinutes: 60,
      serviceType: "regular",
      hourlyRateCents: 4500,
    });
    expect(job.status).toBe(201);

    const res = await api.delete(`/clients/${client.id}`);

    expect(res).toEqual({
      status: 409,
      body: {
        error: {
          code: "conflict",
          message: "Cannot delete: still referenced by jobs",
        },
      },
    });
    expect((await api.get(`/clients/${client.id}`)).status).toBe(200);
  });
});
