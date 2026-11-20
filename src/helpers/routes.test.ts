import { describe, expect, it } from "vitest";

import { createOrganization, startApi } from "../../test/api.ts";
import * as helpers from "./repository.ts";

const api = await startApi();

const missingId = "00000000-0000-7000-8000-000000000000";

// Today on the organization's calendar (the test organization is in Toronto),
// the same way the repository sees it.
const today = new Date().toLocaleDateString("en-CA", {
  timeZone: "America/Toronto",
});

type HelperBody = {
  id: string;
  name: string;
  phone: string | null;
  hourlyRateCents: number | null;
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

// A job of the helper on the given day, at a rate of its own when one is
// given, with the other helpers listed.
async function createJobOf(
  helperId: string,
  scheduledDate: string,
  hourlyRateCents: number | null = null,
  others: string[] = [],
): Promise<string> {
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
  const job = await api.post<{ id: string }>("/jobs", {
    propertyId: property.body.id,
    helpers: [
      { helperId, hourlyRateCents },
      ...others.map((other) => ({ helperId: other })),
    ],
    scheduledDate,
    startTime: "09:00",
    durationMinutes: 60,
    serviceType: "regular",
    hourlyRateCents: 4500,
  });
  expect(job.status).toBe(201);
  return job.body.id;
}

// The rate each job carries itself for the helper; null is their usual rate.
async function ownRatesOf(
  helperId: string,
  ...jobIds: string[]
): Promise<Array<number | null | undefined>> {
  const rates: Array<number | null | undefined> = [];
  for (const id of jobIds) {
    const job = await api.get<{
      helpers: Array<{
        helper: { id: string };
        hourlyRateCents: number | null;
      }>;
    }>(`/jobs/${id}`);
    rates.push(
      job.body.helpers.find((assigned) => assigned.helper.id === helperId)
        ?.hourlyRateCents,
    );
  }
  return rates;
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
      hourlyRateCents: 2200,
    });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      name: "Maria Silva",
      phone: "416-555-0199",
      hourlyRateCents: 2200,
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

  it("leaves the hourly rate empty when none is given", async () => {
    const helper = await createHelper();

    expect(helper.hourlyRateCents).toBeNull();
  });

  it("answers 400 for a negative hourly rate", async () => {
    const res = await api.post("/helpers", {
      name: "Maria Silva",
      hourlyRateCents: -1,
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: {
        code: "validation_error",
        issues: [{ path: "hourlyRateCents" }],
      },
    });
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

  it("sets and clears the hourly rate", async () => {
    const helper = await createHelper();

    const set = await api.patch(`/helpers/${helper.id}`, {
      hourlyRateCents: 2200,
    });
    const cleared = await api.patch(`/helpers/${helper.id}`, {
      hourlyRateCents: null,
    });

    expect(set.body).toMatchObject({ hourlyRateCents: 2200 });
    expect(cleared.body).toMatchObject({ hourlyRateCents: null });
  });

  it("keeps the previous rate on the jobs before today that had none of their own", async () => {
    const helper = await createHelper({ hourlyRateCents: 2200 });
    const past = await createJobOf(helper.id, "2020-01-15");
    const pastWithOwnRate = await createJobOf(helper.id, "2020-01-16", 2500);
    const todays = await createJobOf(helper.id, today);
    const upcoming = await createJobOf(helper.id, "2099-01-15");

    const res = await api.patch(`/helpers/${helper.id}`, {
      hourlyRateCents: 2400,
    });

    expect(res.body).toMatchObject({ hourlyRateCents: 2400 });
    // The work already done stays at 22.00; from today on, the new usual
    // rate applies.
    expect(
      await ownRatesOf(helper.id, past, pastWithOwnRate, todays, upcoming),
    ).toEqual([2200, 2500, null, null]);
  });

  it("keeps the previous rate for that helper only, on a job done by two", async () => {
    const helper = await createHelper({ hourlyRateCents: 2200 });
    const other = await createHelper({ name: "Zoe", hourlyRateCents: 2000 });
    const past = await createJobOf(helper.id, "2020-01-15", null, [other.id]);

    await api.patch(`/helpers/${helper.id}`, { hourlyRateCents: 2400 });

    expect(await ownRatesOf(helper.id, past)).toEqual([2200]);
    expect(await ownRatesOf(other.id, past)).toEqual([null]);
  });

  it("keeps the previous rate on past jobs when the rate is cleared", async () => {
    const helper = await createHelper({ hourlyRateCents: 2200 });
    const past = await createJobOf(helper.id, "2020-01-15");

    await api.patch(`/helpers/${helper.id}`, { hourlyRateCents: null });

    expect(await ownRatesOf(helper.id, past)).toEqual([2200]);
  });

  it("leaves past jobs alone when the rate does not change", async () => {
    const helper = await createHelper({ hourlyRateCents: 2200 });
    const past = await createJobOf(helper.id, "2020-01-15");
    const others = await createHelper({ name: "Zoe", hourlyRateCents: 2200 });
    const othersPast = await createJobOf(others.id, "2020-01-15");

    await api.patch(`/helpers/${helper.id}`, { name: "Maria S. Silva" });
    await api.patch(`/helpers/${helper.id}`, { hourlyRateCents: 2200 });
    // Another helper's raise is not this one's.
    await api.patch(`/helpers/${others.id}`, { hourlyRateCents: 2400 });

    expect(await ownRatesOf(helper.id, past)).toEqual([null]);
    expect(await ownRatesOf(others.id, othersPast)).toEqual([2200]);
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
      helpers: [{ helperId: helper.id }],
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

  it("answers 409 when a series is to generate its jobs with the helper", async () => {
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
    // Too far ahead to have a job yet: only the series has the helper.
    const series = await api.post("/recurring-series", {
      propertyId: property.body.id,
      helpers: [{ helperId: helper.id }],
      everyWeeks: 1,
      startDate: "2099-01-15",
      startTime: "09:00",
      durationMinutes: 60,
      serviceType: "regular",
      hourlyRateCents: 4500,
    });
    expect(series.status).toBe(201);

    const res = await api.delete(`/helpers/${helper.id}`);

    expect(res).toEqual({
      status: 409,
      body: {
        error: {
          code: "conflict",
          message: "Cannot delete: still referenced by recurring_series",
        },
      },
    });
  });
});
