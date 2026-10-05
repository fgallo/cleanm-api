import { describe, expect, it } from "vitest";

import { createOrganization, startApi } from "../../test/api.ts";
import * as helpers from "./repository.ts";

const api = await startApi();

const missingId = "00000000-0000-7000-8000-000000000000";

type HelperBody = {
  id: string;
  name: string;
  phone: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

async function createHelper(input: object = {}): Promise<HelperBody> {
  const res = await api.post<HelperBody>("/helpers", {
    name: "Maria Silva",
    ...input,
  });
  expect(res.status).toBe(201);
  return res.body;
}

// A helper that exists, but in an organization the API is not serving.
async function createHelperElsewhere(): Promise<string> {
  const other = await createOrganization();
  const helper = await helpers.createHelper(other, { name: "Someone Else" });
  return helper.id;
}

describe("POST /helpers", () => {
  it("creates an active helper", async () => {
    const res = await api.post("/helpers", {
      name: "Maria Silva",
      phone: "416-555-0199",
    });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      name: "Maria Silva",
      phone: "416-555-0199",
      active: true,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });

  it("does not take active at creation", async () => {
    const res = await api.post("/helpers", { name: "Maria", active: false });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ active: true, phone: null });
  });

  it("answers 400 without a name", async () => {
    const res = await api.post("/helpers", { phone: "416-555-0199" });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: { code: "validation_error", issues: [{ path: "name" }] },
    });
  });
});

describe("GET /helpers", () => {
  it("lists the helpers ordered by name, inactive ones included", async () => {
    await createHelper({ name: "Zoe" });
    const ana = await createHelper({ name: "Ana" });
    await api.patch(`/helpers/${ana.id}`, { active: false });

    const res = await api.get<HelperBody[]>("/helpers");

    expect(res.status).toBe(200);
    expect(res.body.map((helper) => [helper.name, helper.active])).toEqual([
      ["Ana", false],
      ["Zoe", true],
    ]);
  });

  it("does not list helpers of another organization", async () => {
    await createHelperElsewhere();

    const res = await api.get("/helpers");

    expect(res).toEqual({ status: 200, body: [] });
  });
});

describe("GET /helpers/:id", () => {
  it("returns the helper", async () => {
    const helper = await createHelper();

    const res = await api.get(`/helpers/${helper.id}`);

    expect(res).toEqual({ status: 200, body: helper });
  });

  it("answers 404 for a helper that does not exist", async () => {
    const res = await api.get(`/helpers/${missingId}`);

    expect(res).toEqual({
      status: 404,
      body: { error: { code: "not_found", message: "Helper not found" } },
    });
  });

  it("answers 404 for a helper of another organization", async () => {
    const id = await createHelperElsewhere();

    const res = await api.get(`/helpers/${id}`);

    expect(res.status).toBe(404);
  });
});

describe("PATCH /helpers/:id", () => {
  it("updates only the fields sent", async () => {
    const helper = await createHelper({ phone: "416-555-0199" });

    const res = await api.patch<HelperBody>(`/helpers/${helper.id}`, {
      name: "Maria S. Silva",
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name: "Maria S. Silva",
      phone: "416-555-0199",
      active: true,
    });
    expect(res.body.updatedAt > helper.updatedAt).toBe(true);
  });

  it("deactivates and reactivates a helper", async () => {
    const helper = await createHelper();

    const off = await api.patch(`/helpers/${helper.id}`, { active: false });
    const on = await api.patch(`/helpers/${helper.id}`, { active: true });

    expect(off.body).toMatchObject({ active: false });
    expect(on.body).toMatchObject({ active: true });
  });

  it("answers 400 when active is not a boolean", async () => {
    const helper = await createHelper();

    const res = await api.patch(`/helpers/${helper.id}`, { active: "no" });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: { code: "validation_error", issues: [{ path: "active" }] },
    });
  });

  it("answers 404 for a helper that does not exist", async () => {
    const res = await api.patch(`/helpers/${missingId}`, { name: "Nobody" });

    expect(res.status).toBe(404);
  });
});

describe("DELETE /helpers/:id", () => {
  it("deletes the helper", async () => {
    const helper = await createHelper();

    const res = await api.delete(`/helpers/${helper.id}`);

    expect(res).toEqual({ status: 204, body: undefined });
    expect((await api.get(`/helpers/${helper.id}`)).status).toBe(404);
  });

  it("answers 404 for a helper that does not exist", async () => {
    const res = await api.delete(`/helpers/${missingId}`);

    expect(res.status).toBe(404);
  });

  it("answers 409 when the helper has jobs, so history is kept", async () => {
    const helper = await createHelper();
    const client = await api.post<{ id: string }>("/clients", {
      name: "Jane Doe",
    });
    const property = await api.post<{ id: string }>(
      `/clients/${client.body.id}/properties`,
      {
        addressLine1: "123 Example St",
        city: "Toronto",
        province: "ON",
        postalCode: "M5V 0A1",
      },
    );
    const job = await api.post("/jobs", {
      propertyId: property.body.id,
      helperId: helper.id,
      scheduledDate: "2026-10-14",
      startTime: "09:00",
      durationMinutes: 60,
      serviceType: "regular",
      hourlyRateCents: 4500,
    });
    expect(job.status).toBe(201);

    const res = await api.delete(`/helpers/${helper.id}`);

    expect(res).toEqual({
      status: 409,
      body: {
        error: {
          code: "conflict",
          message: "Cannot delete: still referenced by jobs",
        },
      },
    });
  });
});
