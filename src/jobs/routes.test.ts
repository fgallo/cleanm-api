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
  helpers: Array<{
    helper: { id: string; name: string; hourlyRateCents: number | null };
    hourlyRateCents: number | null;
    payCents: number | null;
  }>;
  ownerWorks: boolean;
  people: number;
  onSiteMinutes: number;
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
      helpers: [],
      ownerWorks: true,
      people: 1,
      onSiteMinutes: 150,
      recurringSeriesId: null,
      invoice: null,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });

  it("assigns helpers, listed by name and paid their usual rate", async () => {
    const { propertyId } = await createProperty();
    const zoe = await createHelper({ name: "Zoe", hourlyRateCents: 2000 });
    const maria = await createHelper({
      name: "Maria Silva",
      hourlyRateCents: 2200,
    });

    const job = await createJob(propertyId, {
      helpers: [{ helperId: zoe }, { helperId: maria }],
    });

    // 150 minutes between the two of them and the owner: 50 minutes each.
    expect(job.helpers).toEqual([
      {
        helper: { id: maria, name: "Maria Silva", hourlyRateCents: 2200 },
        hourlyRateCents: null,
        payCents: 1833,
      },
      {
        helper: { id: zoe, name: "Zoe", hourlyRateCents: 2000 },
        hourlyRateCents: null,
        payCents: 1667,
      },
    ]);
  });

  it("pays a helper another rate when the job has one for them", async () => {
    const { propertyId } = await createProperty();
    const maria = await createHelper({ hourlyRateCents: 2200 });
    const zoe = await createHelper({ name: "Zoe", hourlyRateCents: 2000 });

    const job = await createJob(propertyId, {
      helpers: [{ helperId: maria, hourlyRateCents: 2500 }, { helperId: zoe }],
    });

    expect(job.helpers).toMatchObject([
      // The helper's usual rate is untouched.
      { helper: { id: maria, hourlyRateCents: 2200 }, hourlyRateCents: 2500 },
      { helper: { id: zoe, hourlyRateCents: 2000 }, hourlyRateCents: null },
    ]);
  });

  it("answers 400 for a negative helper rate", async () => {
    const { propertyId } = await createProperty();
    const helperId = await createHelper();

    const res = await api.post("/jobs", {
      propertyId,
      scheduledDate: "2026-10-14",
      startTime: "09:00",
      durationMinutes: 150,
      serviceType: "regular",
      hourlyRateCents: 4500,
      helpers: [{ helperId, hourlyRateCents: -1 }],
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: { issues: [{ path: "helpers.0.hourlyRateCents" }] },
    });
  });

  it("answers 400 for a helper listed twice", async () => {
    const { propertyId } = await createProperty();
    const helperId = await createHelper();

    const res = await api.post("/jobs", {
      propertyId,
      scheduledDate: "2026-10-14",
      startTime: "09:00",
      durationMinutes: 150,
      serviceType: "regular",
      hourlyRateCents: 4500,
      helpers: [{ helperId }, { helperId, hourlyRateCents: 2500 }],
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: {
        issues: [
          { path: "helpers", message: "A helper can be listed only once" },
        ],
      },
    });
  });

  it("answers 400 for a helper that does not exist, naming its place in the list", async () => {
    const { propertyId } = await createProperty();
    const helperId = await createHelper();

    const res = await api.post("/jobs", {
      propertyId,
      helpers: [{ helperId }, { helperId: missingId }],
      scheduledDate: "2026-10-14",
      startTime: "09:00",
      durationMinutes: 60,
      serviceType: "regular",
      hourlyRateCents: 4500,
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: {
        code: "validation_error",
        message: "Invalid request",
        issues: [{ path: "helpers.1.helperId", message: "Helper not found" }],
      },
    });
    // Nothing was created with the helper that does exist.
    expect((await api.get("/jobs?from=2026-10-14&to=2026-10-14")).body).toEqual(
      [],
    );
  });

  it("answers 400 for a helper of another organization", async () => {
    const { propertyId } = await createProperty();
    const other = await createOrganization();
    const helper = await helpers.createHelper(other, { name: "Someone Else" });

    const res = await api.post("/jobs", {
      propertyId,
      helpers: [{ helperId: helper.id }],
      scheduledDate: "2026-10-14",
      startTime: "09:00",
      durationMinutes: 60,
      serviceType: "regular",
      hourlyRateCents: 4500,
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: {
        issues: [{ path: "helpers.0.helperId", message: "Helper not found" }],
      },
    });
  });

  it("answers 400 for a helper that is not active", async () => {
    const { propertyId } = await createProperty();
    const helperId = await createHelper();
    await api.patch(`/helpers/${helperId}`, { active: false });

    const res = await api.post("/jobs", {
      propertyId,
      helpers: [{ helperId }],
      scheduledDate: "2026-10-14",
      startTime: "09:00",
      durationMinutes: 60,
      serviceType: "regular",
      hourlyRateCents: 4500,
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: {
        issues: [
          { path: "helpers.0.helperId", message: "Helper is not active" },
        ],
      },
    });
  });

  it("defaults the status to scheduled and the optional fields to null", async () => {
    const { propertyId } = await createProperty();

    const job = await createJob(propertyId);

    expect(job).toMatchObject({
      status: "scheduled",
      fixedPriceCents: null,
      helpers: [],
      ownerWorks: true,
      notes: null,
    });
  });

  it("shares the hours of cleaning between the owner and the helpers", async () => {
    const { propertyId } = await createProperty();
    const maria = await createHelper();
    const zoe = await createHelper({ name: "Zoe" });

    const alone = await createJob(propertyId, { durationMinutes: 180 });
    const withOne = await createJob(propertyId, {
      durationMinutes: 180,
      helpers: [{ helperId: maria }],
    });
    const withTwo = await createJob(propertyId, {
      durationMinutes: 180,
      helpers: [{ helperId: maria }, { helperId: zoe }],
    });

    expect(alone).toMatchObject({ people: 1, onSiteMinutes: 180 });
    expect(withOne).toMatchObject({ people: 2, onSiteMinutes: 90 });
    expect(withTwo).toMatchObject({ people: 3, onSiteMinutes: 60 });
    // The client pays the hours of cleaning, whoever does them.
    expect(
      [alone, withOne, withTwo].map((job) => [
        job.durationMinutes,
        job.priceCents,
      ]),
    ).toEqual([
      [180, 13500],
      [180, 13500],
      [180, 13500],
    ]);
  });

  it("counts only the helpers on a job the owner does not work on", async () => {
    const { propertyId } = await createProperty();
    const maria = await createHelper();
    const zoe = await createHelper({ name: "Zoe" });

    const job = await createJob(propertyId, {
      durationMinutes: 180,
      ownerWorks: false,
      helpers: [{ helperId: maria }, { helperId: zoe }],
    });

    expect(job).toMatchObject({
      ownerWorks: false,
      people: 2,
      onSiteMinutes: 90,
    });
  });

  it("counts one person while nobody is marked", async () => {
    const { propertyId } = await createProperty();

    const job = await createJob(propertyId, {
      durationMinutes: 180,
      ownerWorks: false,
    });

    expect(job).toMatchObject({
      ownerWorks: false,
      helpers: [],
      people: 1,
      onSiteMinutes: 180,
    });
  });

  it("rounds the time at the house to the minute, never to none", async () => {
    const { propertyId } = await createProperty();
    const maria = await createHelper();
    const zoe = await createHelper({ name: "Zoe" });
    const ana = await createHelper({ name: "Ana" });
    const three = [{ helperId: maria }, { helperId: zoe }];
    const four = [...three, { helperId: ana }];

    const onSite = [];
    for (const [durationMinutes, helpers] of [
      [200, three], // 66.67
      [100, three], // 33.33
      [150, four], // 37.5
      [1, three], // 0.33
    ] as const) {
      const job = await createJob(propertyId, { durationMinutes, helpers });
      onSite.push(job.onSiteMinutes);
    }

    expect(onSite).toEqual([67, 33, 38, 1]);
  });

  it("pays each helper their rate for the time at the house", async () => {
    const { propertyId } = await createProperty();
    const maria = await createHelper({ hourlyRateCents: 2200 });
    const zoe = await createHelper({ name: "Zoe", hourlyRateCents: 2000 });
    const ana = await createHelper({ name: "Ana" });

    const job = await createJob(propertyId, {
      durationMinutes: 200,
      ownerWorks: false,
      helpers: [
        { helperId: maria },
        { helperId: zoe, hourlyRateCents: 2500 },
        { helperId: ana },
      ],
    });

    // 200 minutes between three: 67 minutes each, as the job reads.
    expect(job).toMatchObject({ people: 3, onSiteMinutes: 67 });
    expect(
      job.helpers.map((assigned) => [assigned.helper.name, assigned.payCents]),
    ).toEqual([
      // No rate, usual or of the job: nothing to work out.
      ["Ana", null],
      // The usual rate: 2200 x 67 / 60.
      ["Maria Silva", 2457],
      // The rate of the job, not the usual 2000: 2500 x 67 / 60.
      ["Zoe", 2792],
    ]);
  });

  it("answers 400 unless ownerWorks is true or false", async () => {
    const { propertyId } = await createProperty();
    const job = {
      propertyId,
      scheduledDate: "2026-10-14",
      startTime: "09:00",
      durationMinutes: 150,
      serviceType: "regular",
      hourlyRateCents: 4500,
    };

    const text = await api.post("/jobs", { ...job, ownerWorks: "yes" });
    const cleared = await api.post("/jobs", { ...job, ownerWorks: null });

    for (const res of [text, cleared]) {
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        error: { issues: [{ path: "ownerWorks" }] },
      });
    }
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

  it("lists each job with the people who do it", async () => {
    const { propertyId } = await createProperty();
    const maria = await createHelper({ hourlyRateCents: 2200 });
    const zoe = await createHelper({ name: "Zoe" });
    await createJob(propertyId, { startTime: "08:00", durationMinutes: 120 });
    await createJob(propertyId, {
      startTime: "10:00",
      durationMinutes: 120,
      helpers: [{ helperId: maria }],
    });
    await createJob(propertyId, {
      startTime: "13:00",
      durationMinutes: 120,
      ownerWorks: false,
      helpers: [{ helperId: maria }, { helperId: zoe }],
    });

    const res = await api.get<JobBody[]>("/jobs?from=2026-10-14&to=2026-10-14");

    expect(
      res.body.map((job) => [
        job.people,
        job.onSiteMinutes,
        job.helpers.map((assigned) => assigned.payCents),
      ]),
    ).toEqual([
      [1, 120, []],
      [2, 60, [2200]],
      [2, 60, [2200, null]],
    ]);
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
      onSiteMinutes: 180,
      updatedAt: expect.any(String),
    });
    expect(res.body.updatedAt > job.updatedAt).toBe(true);
  });

  it("takes the owner off the job and puts the owner back", async () => {
    const { propertyId } = await createProperty();
    const helperId = await createHelper({ hourlyRateCents: 2000 });
    const job = await createJob(propertyId, {
      durationMinutes: 180,
      helpers: [{ helperId }],
    });

    const off = await api.patch<JobBody>(`/jobs/${job.id}`, {
      ownerWorks: false,
    });
    const back = await api.patch<JobBody>(`/jobs/${job.id}`, {
      ownerWorks: true,
    });

    expect(job).toMatchObject({
      ownerWorks: true,
      people: 2,
      onSiteMinutes: 90,
      helpers: [{ payCents: 3000 }],
    });
    // Alone, the helper is there for all of the hours, and is paid for them.
    expect(off.status).toBe(200);
    expect(off.body).toMatchObject({
      ownerWorks: false,
      people: 1,
      onSiteMinutes: 180,
      helpers: [{ payCents: 6000 }],
      priceCents: job.priceCents,
    });
    expect(off.body.updatedAt > job.updatedAt).toBe(true);
    expect(back.body).toMatchObject({
      ownerWorks: true,
      people: 2,
      onSiteMinutes: 90,
      helpers: [{ payCents: 3000 }],
    });
  });

  it("leaves the owner alone when ownerWorks is not sent", async () => {
    const { propertyId } = await createProperty();
    const job = await createJob(propertyId, { ownerWorks: false });

    const res = await api.patch<JobBody>(`/jobs/${job.id}`, {
      notes: "Bring the ladder",
    });

    expect(res.body.ownerWorks).toBe(false);
  });

  it("works out the time at the house again when the helpers change", async () => {
    const { propertyId } = await createProperty();
    const maria = await createHelper({ hourlyRateCents: 2000 });
    const zoe = await createHelper({ name: "Zoe", hourlyRateCents: 2400 });
    const job = await createJob(propertyId, {
      durationMinutes: 180,
      helpers: [{ helperId: maria }],
    });

    const res = await api.patch<JobBody>(`/jobs/${job.id}`, {
      helpers: [{ helperId: maria }, { helperId: zoe }],
    });

    expect(job).toMatchObject({ people: 2, onSiteMinutes: 90 });
    expect(res.body).toMatchObject({
      people: 3,
      onSiteMinutes: 60,
      helpers: [{ payCents: 2000 }, { payCents: 2400 }],
    });
  });

  it("answers 400 for an ownerWorks set to null", async () => {
    const { propertyId } = await createProperty();
    const job = await createJob(propertyId);

    const res = await api.patch(`/jobs/${job.id}`, { ownerWorks: null });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: { issues: [{ path: "ownerWorks" }] },
    });
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

  it("replaces the helpers of the job with the list given", async () => {
    const { propertyId } = await createProperty();
    const maria = await createHelper({ name: "Maria Silva" });
    const zoe = await createHelper({ name: "Zoe" });
    const ana = await createHelper({ name: "Ana" });
    const job = await createJob(propertyId, { helpers: [{ helperId: maria }] });

    const replaced = await api.patch<JobBody>(`/jobs/${job.id}`, {
      helpers: [{ helperId: zoe, hourlyRateCents: 2100 }, { helperId: ana }],
    });
    const emptied = await api.patch<JobBody>(`/jobs/${job.id}`, {
      helpers: [],
    });

    expect(replaced.status).toBe(200);
    expect(replaced.body.helpers).toEqual([
      {
        helper: { id: ana, name: "Ana", hourlyRateCents: null },
        hourlyRateCents: null,
        payCents: null,
      },
      {
        helper: { id: zoe, name: "Zoe", hourlyRateCents: null },
        hourlyRateCents: 2100,
        // 150 minutes between the two of them and the owner: 50 minutes.
        payCents: 1750,
      },
    ]);
    // The helpers are part of the job: changing them changes it.
    expect(replaced.body.updatedAt > job.updatedAt).toBe(true);
    expect(emptied.status).toBe(200);
    expect(emptied.body.helpers).toEqual([]);
  });

  it("leaves the helpers alone when the list is not sent", async () => {
    const { propertyId } = await createProperty();
    const helperId = await createHelper();
    const job = await createJob(propertyId, {
      helpers: [{ helperId, hourlyRateCents: 2500 }],
    });

    const res = await api.patch<JobBody>(`/jobs/${job.id}`, {
      notes: "Bring the ladder",
    });

    expect(res.status).toBe(200);
    expect(res.body.helpers).toEqual(job.helpers);
  });

  it("sets and clears a helper's rate for the job", async () => {
    const { propertyId } = await createProperty();
    const helperId = await createHelper({ hourlyRateCents: 2200 });
    const job = await createJob(propertyId, { helpers: [{ helperId }] });

    const set = await api.patch<JobBody>(`/jobs/${job.id}`, {
      helpers: [{ helperId, hourlyRateCents: 2500 }],
    });
    const cleared = await api.patch<JobBody>(`/jobs/${job.id}`, {
      helpers: [{ helperId, hourlyRateCents: null }],
    });

    expect(set.body.helpers).toMatchObject([{ hourlyRateCents: 2500 }]);
    expect(cleared.body.helpers).toMatchObject([{ hourlyRateCents: null }]);
  });

  it("answers 400 for a helper that is not active", async () => {
    const { propertyId } = await createProperty();
    const job = await createJob(propertyId);
    const helperId = await createHelper();
    await api.patch(`/helpers/${helperId}`, { active: false });

    const res = await api.patch(`/jobs/${job.id}`, { helpers: [{ helperId }] });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: {
        issues: [
          { path: "helpers.0.helperId", message: "Helper is not active" },
        ],
      },
    });
  });

  it("keeps the helper on a job after the helper is deactivated", async () => {
    const { propertyId } = await createProperty();
    const helperId = await createHelper({ name: "Maria Silva" });
    const job = await createJob(propertyId, { helpers: [{ helperId }] });
    await api.patch(`/helpers/${helperId}`, { active: false });

    const res = await api.patch<JobBody>(`/jobs/${job.id}`, {
      status: "completed",
    });

    expect(res.status).toBe(200);
    expect(res.body.helpers).toEqual(job.helpers);
  });

  it("takes a list that still has a helper deactivated since", async () => {
    const { propertyId } = await createProperty();
    const maria = await createHelper({ name: "Maria Silva" });
    const zoe = await createHelper({ name: "Zoe" });
    const job = await createJob(propertyId, { helpers: [{ helperId: maria }] });
    await api.patch(`/helpers/${maria}`, { active: false });

    // The whole list travels to add one helper: the one the job already
    // had is not refused.
    const res = await api.patch<JobBody>(`/jobs/${job.id}`, {
      helpers: [{ helperId: maria }, { helperId: zoe }],
    });

    expect(res.status).toBe(200);
    expect(res.body.helpers.map((assigned) => assigned.helper.id)).toEqual([
      maria,
      zoe,
    ]);
  });

  it("does not accept a new property", async () => {
    const { propertyId } = await createProperty();
    const job = await createJob(propertyId);

    const res = await api.patch(`/jobs/${job.id}`, { propertyId: missingId });

    expect(res.status).toBe(400);
  });

  it("answers 404 for a job that does not exist", async () => {
    const fields = await api.patch(`/jobs/${missingId}`, {
      durationMinutes: 60,
    });
    const helpersOnly = await api.patch(`/jobs/${missingId}`, { helpers: [] });

    expect(fields.status).toBe(404);
    expect(helpersOnly.status).toBe(404);
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

  it("deletes a job together with who was assigned to it", async () => {
    const { propertyId } = await createProperty();
    const helperId = await createHelper();
    const job = await createJob(propertyId, { helpers: [{ helperId }] });

    const res = await api.delete(`/jobs/${job.id}`);

    expect(res.status).toBe(204);
    // Nothing of the job holds the helper any more.
    expect((await api.delete(`/helpers/${helperId}`)).status).toBe(204);
  });

  it("answers 404 for a job that does not exist", async () => {
    const res = await api.delete(`/jobs/${missingId}`);

    expect(res.status).toBe(404);
  });
});
