import { describe, expect, it } from "vitest";

import { createOrganization, startApi } from "../../test/api.ts";
import * as clients from "../clients/repository.ts";
import * as helpers from "../helpers/repository.ts";
import * as properties from "../properties/repository.ts";
import * as jobs from "./repository.ts";

const api = await startApi();

const missingId = "00000000-0000-7000-8000-000000000000";

const address = {
  addressLine1: "123 Example St",
  city: "Toronto",
  province: "ON",
  postalCode: "M5V 0A1",
};

type JobBody = {
  id: string;
  scheduledDate: string;
  startTime: string;
  durationMinutes: number;
  serviceType: string;
  status: string;
  hourlyRateCents: number;
  fixedPriceCents: number | null;
  priceCents: number;
  notes: string | null;
  property: { id: string; addressLine1: string };
  client: { id: string; name: string };
  helper: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
};

async function createHelper(input: object = {}): Promise<string> {
  const res = await api.post<{ id: string }>("/helpers", {
    name: "Maria Silva",
    ...input,
  });
  expect(res.status).toBe(201);
  return res.body.id;
}

async function createProperty(): Promise<{
  clientId: string;
  propertyId: string;
}> {
  const client = await api.post<{ id: string }>("/clients", {
    name: "Jane Doe",
  });
  expect(client.status).toBe(201);
  const property = await api.post<{ id: string }>(
    `/clients/${client.body.id}/properties`,
    address,
  );
  expect(property.status).toBe(201);
  return { clientId: client.body.id, propertyId: property.body.id };
}

async function createJob(
  propertyId: string,
  input: object = {},
): Promise<JobBody> {
  const res = await api.post<JobBody>("/jobs", {
    propertyId,
    scheduledDate: "2026-10-14",
    startTime: "09:00",
    durationMinutes: 150,
    serviceType: "regular",
    hourlyRateCents: 4500,
    ...input,
  });
  expect(res.status).toBe(201);
  return res.body;
}

// A property that exists, but in an organization the API is not serving.
async function createPropertyElsewhere(): Promise<{
  organizationId: string;
  propertyId: string;
}> {
  const organizationId = await createOrganization();
  const client = await clients.createClient(organizationId, {
    name: "Someone Else",
  });
  const property = await properties.createProperty(
    organizationId,
    client.id,
    address,
  );
  if (property === undefined) {
    throw new Error("Expected the property to be created");
  }
  return { organizationId, propertyId: property.id };
}

describe("POST /jobs", () => {
  it("creates a job with the property and client embedded", async () => {
    const { clientId, propertyId } = await createProperty();

    const res = await api.post("/jobs", {
      propertyId,
      scheduledDate: "2026-10-14",
      startTime: "09:00",
      durationMinutes: 150,
      serviceType: "deep",
      status: "estimated",
      hourlyRateCents: 4500,
      notes: "Bring the ladder",
    });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      scheduledDate: "2026-10-14",
      startTime: "09:00:00",
      durationMinutes: 150,
      serviceType: "deep",
      status: "estimated",
      hourlyRateCents: 4500,
      fixedPriceCents: null,
      priceCents: 11250,
      notes: "Bring the ladder",
      property: {
        id: propertyId,
        ...address,
        addressLine2: null,
        country: "CA",
        notes: null,
      },
      client: { id: clientId, name: "Jane Doe" },
      helper: null,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });

  it("assigns a helper", async () => {
    const { propertyId } = await createProperty();
    const helperId = await createHelper({ name: "Maria Silva" });

    const job = await createJob(propertyId, { helperId });

    expect(job.helper).toEqual({ id: helperId, name: "Maria Silva" });
  });

  it("answers 400 for a helper that does not exist", async () => {
    const { propertyId } = await createProperty();

    const res = await api.post("/jobs", {
      propertyId,
      helperId: missingId,
      scheduledDate: "2026-10-14",
      startTime: "09:00",
      durationMinutes: 60,
      serviceType: "regular",
      hourlyRateCents: 4500,
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: {
        code: "validation_error",
        issues: [{ path: "helperId", message: "Helper not found" }],
      },
    });
  });

  it("answers 400 for a helper of another organization", async () => {
    const { propertyId } = await createProperty();
    const other = await createOrganization();
    const helper = await helpers.createHelper(other, { name: "Someone Else" });

    const res = await api.post("/jobs", {
      propertyId,
      helperId: helper.id,
      scheduledDate: "2026-10-14",
      startTime: "09:00",
      durationMinutes: 60,
      serviceType: "regular",
      hourlyRateCents: 4500,
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: { issues: [{ path: "helperId", message: "Helper not found" }] },
    });
  });

  it("answers 400 for a helper that is not active", async () => {
    const { propertyId } = await createProperty();
    const helperId = await createHelper();
    await api.patch(`/helpers/${helperId}`, { active: false });

    const res = await api.post("/jobs", {
      propertyId,
      helperId,
      scheduledDate: "2026-10-14",
      startTime: "09:00",
      durationMinutes: 60,
      serviceType: "regular",
      hourlyRateCents: 4500,
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: {
        issues: [{ path: "helperId", message: "Helper is not active" }],
      },
    });
  });

  it("defaults the status to scheduled and the optional fields to null", async () => {
    const { propertyId } = await createProperty();

    const job = await createJob(propertyId);

    expect(job).toMatchObject({
      status: "scheduled",
      fixedPriceCents: null,
      notes: null,
    });
  });

  it("rounds the hourly price to whole cents", async () => {
    const { propertyId } = await createProperty();

    const job = await createJob(propertyId, {
      hourlyRateCents: 4499,
      durationMinutes: 50,
    });

    expect(job.priceCents).toBe(3749);
  });

  it("uses the fixed price when one is given", async () => {
    const { propertyId } = await createProperty();

    const job = await createJob(propertyId, { fixedPriceCents: 30000 });

    expect(job).toMatchObject({ fixedPriceCents: 30000, priceCents: 30000 });
  });

  it("answers 400 with one issue per invalid field", async () => {
    const res = await api.post("/jobs", {
      propertyId: "not-a-uuid",
      scheduledDate: "14/10/2026",
      startTime: "9am",
      durationMinutes: 0,
      serviceType: "window",
      hourlyRateCents: 45.5,
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: {
        code: "validation_error",
        issues: [
          { path: "propertyId" },
          { path: "scheduledDate" },
          { path: "startTime" },
          { path: "durationMinutes" },
          { path: "serviceType" },
          { path: "hourlyRateCents" },
        ],
      },
    });
  });

  it("answers 400 for a property that does not exist", async () => {
    const res = await api.post("/jobs", {
      propertyId: missingId,
      scheduledDate: "2026-10-14",
      startTime: "09:00",
      durationMinutes: 60,
      serviceType: "regular",
      hourlyRateCents: 4500,
    });

    expect(res).toEqual({
      status: 400,
      body: {
        error: {
          code: "validation_error",
          message: "Invalid request",
          issues: [{ path: "propertyId", message: "Property not found" }],
        },
      },
    });
  });

  it("answers 400 for a property of another organization", async () => {
    const { propertyId } = await createPropertyElsewhere();

    const res = await api.post("/jobs", {
      propertyId,
      scheduledDate: "2026-10-14",
      startTime: "09:00",
      durationMinutes: 60,
      serviceType: "regular",
      hourlyRateCents: 4500,
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: { issues: [{ path: "propertyId" }] },
    });
  });
});

describe("GET /jobs", () => {
  it("lists the jobs in the date range ordered by date and time", async () => {
    const { propertyId } = await createProperty();
    const later = await createJob(propertyId, {
      scheduledDate: "2026-10-14",
      startTime: "13:00",
    });
    const earlier = await createJob(propertyId, {
      scheduledDate: "2026-10-14",
      startTime: "09:00",
    });
    const nextDay = await createJob(propertyId, {
      scheduledDate: "2026-10-15",
      startTime: "08:00",
    });
    await createJob(propertyId, { scheduledDate: "2026-10-16" });

    const res = await api.get("/jobs?from=2026-10-14&to=2026-10-15");

    expect(res).toEqual({ status: 200, body: [earlier, later, nextDay] });
  });

  it("does not list jobs of another organization", async () => {
    const { organizationId, propertyId } = await createPropertyElsewhere();
    const job = await jobs.createJob(organizationId, {
      propertyId,
      scheduledDate: "2026-10-14",
      startTime: "09:00",
      durationMinutes: 60,
      serviceType: "regular",
      hourlyRateCents: 4500,
    });
    expect(job).toBeDefined();

    const res = await api.get("/jobs?from=2026-01-01&to=2026-12-31");

    expect(res).toEqual({ status: 200, body: [] });
  });

  it("answers 400 without a date range", async () => {
    const res = await api.get("/jobs");

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: {
        code: "validation_error",
        issues: [{ path: "from" }, { path: "to" }],
      },
    });
  });

  it("answers 400 when the range ends before it starts", async () => {
    const res = await api.get("/jobs?from=2026-10-15&to=2026-10-14");

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: { issues: [{ path: "to", message: "Must not be before from" }] },
    });
  });
});

describe("GET /jobs/:id", () => {
  it("returns the job", async () => {
    const { propertyId } = await createProperty();
    const job = await createJob(propertyId);

    const res = await api.get(`/jobs/${job.id}`);

    expect(res).toEqual({ status: 200, body: job });
  });

  it("answers 404 for a job that does not exist", async () => {
    const res = await api.get(`/jobs/${missingId}`);

    expect(res).toEqual({
      status: 404,
      body: { error: { code: "not_found", message: "Job not found" } },
    });
  });

  it("answers 400 for an id that is not a UUID", async () => {
    const res = await api.get("/jobs/not-a-uuid");

    expect(res.status).toBe(400);
  });
});

describe("PATCH /jobs/:id", () => {
  it("recomputes the hourly price when the duration changes", async () => {
    const { propertyId } = await createProperty();
    const job = await createJob(propertyId);

    const res = await api.patch<JobBody>(`/jobs/${job.id}`, {
      durationMinutes: 180,
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ...job,
      durationMinutes: 180,
      priceCents: 13500,
      updatedAt: expect.any(String),
    });
    expect(res.body.updatedAt > job.updatedAt).toBe(true);
  });

  it("keeps a fixed price when the duration changes", async () => {
    const { propertyId } = await createProperty();
    const job = await createJob(propertyId, { fixedPriceCents: 30000 });

    const res = await api.patch(`/jobs/${job.id}`, { durationMinutes: 180 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      fixedPriceCents: 30000,
      priceCents: 30000,
    });
  });

  it("goes back to the hourly price when the fixed price is cleared", async () => {
    const { propertyId } = await createProperty();
    const job = await createJob(propertyId, { fixedPriceCents: 30000 });

    const res = await api.patch(`/jobs/${job.id}`, { fixedPriceCents: null });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      fixedPriceCents: null,
      priceCents: 11250,
    });
  });

  it("moves the job and changes its status", async () => {
    const { propertyId } = await createProperty();
    const job = await createJob(propertyId);

    const res = await api.patch(`/jobs/${job.id}`, {
      scheduledDate: "2026-10-15",
      startTime: "10:15",
      status: "completed",
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      scheduledDate: "2026-10-15",
      startTime: "10:15:00",
      status: "completed",
    });
  });

  it("answers 400 for an unknown status", async () => {
    const { propertyId } = await createProperty();
    const job = await createJob(propertyId);

    const res = await api.patch(`/jobs/${job.id}`, { status: "done" });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: { code: "validation_error", issues: [{ path: "status" }] },
    });
  });

  it("assigns and unassigns a helper", async () => {
    const { propertyId } = await createProperty();
    const job = await createJob(propertyId);
    const helperId = await createHelper({ name: "Maria Silva" });

    const assigned = await api.patch<JobBody>(`/jobs/${job.id}`, { helperId });
    const unassigned = await api.patch<JobBody>(`/jobs/${job.id}`, {
      helperId: null,
    });

    expect(assigned.status).toBe(200);
    expect(assigned.body.helper).toEqual({ id: helperId, name: "Maria Silva" });
    expect(unassigned.status).toBe(200);
    expect(unassigned.body.helper).toBeNull();
  });

  it("answers 400 for a helper that is not active", async () => {
    const { propertyId } = await createProperty();
    const job = await createJob(propertyId);
    const helperId = await createHelper();
    await api.patch(`/helpers/${helperId}`, { active: false });

    const res = await api.patch(`/jobs/${job.id}`, { helperId });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: { issues: [{ path: "helperId" }] },
    });
  });

  it("keeps the helper on a job after the helper is deactivated", async () => {
    const { propertyId } = await createProperty();
    const helperId = await createHelper({ name: "Maria Silva" });
    const job = await createJob(propertyId, { helperId });
    await api.patch(`/helpers/${helperId}`, { active: false });

    const res = await api.patch<JobBody>(`/jobs/${job.id}`, {
      status: "completed",
    });

    expect(res.status).toBe(200);
    expect(res.body.helper).toEqual({ id: helperId, name: "Maria Silva" });
  });

  it("does not accept a new property", async () => {
    const { propertyId } = await createProperty();
    const job = await createJob(propertyId);

    const res = await api.patch(`/jobs/${job.id}`, { propertyId: missingId });

    expect(res.status).toBe(400);
  });

  it("answers 404 for a job that does not exist", async () => {
    const res = await api.patch(`/jobs/${missingId}`, { durationMinutes: 60 });

    expect(res.status).toBe(404);
  });
});

describe("DELETE /jobs/:id", () => {
  it("deletes the job", async () => {
    const { propertyId } = await createProperty();
    const job = await createJob(propertyId);

    const res = await api.delete(`/jobs/${job.id}`);

    expect(res).toEqual({ status: 204, body: undefined });
    expect((await api.get(`/jobs/${job.id}`)).status).toBe(404);
  });

  it("answers 404 for a job that does not exist", async () => {
    const res = await api.delete(`/jobs/${missingId}`);

    expect(res.status).toBe(404);
  });
});
