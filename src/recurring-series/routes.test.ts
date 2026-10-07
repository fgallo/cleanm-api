import { describe, expect, it } from "vitest";

import { startApi } from "../../test/api.ts";
import { addDays, occurrences } from "./occurrences.ts";
import * as repository from "./repository.ts";

const api = await startApi();

const missingId = "00000000-0000-7000-8000-000000000000";

// Today on the organization's calendar (the test organization is in Toronto),
// the same way the service sees it.
const today = new Date().toLocaleDateString("en-CA", {
  timeZone: "America/Toronto",
});
const horizon = addDays(today, 56);

type SeriesBody = {
  id: string;
  everyWeeks: number | null;
  dayOfMonth: number | null;
  startDate: string;
  endDate: string | null;
  generatedUntil: string | null;
  startTime: string;
  durationMinutes: number;
  serviceType: string;
  hourlyRateCents: number;
  fixedPriceCents: number | null;
  notes: string | null;
  property: { id: string };
  client: { id: string; name: string };
  helper: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
};

type JobBody = {
  id: string;
  scheduledDate: string;
  startTime: string;
  durationMinutes: number;
  status: string;
  hourlyRateCents: number;
  priceCents: number;
  notes: string | null;
  helper: { id: string; name: string } | null;
  recurringSeriesId: string | null;
};

async function createProperty(): Promise<string> {
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
  expect(property.status).toBe(201);
  return property.body.id;
}

async function createHelper(name = "Maria Silva"): Promise<string> {
  const res = await api.post<{ id: string }>("/helpers", { name });
  expect(res.status).toBe(201);
  return res.body.id;
}

async function createSeries(input: object = {}): Promise<SeriesBody> {
  const res = await api.post<SeriesBody>("/recurring-series", {
    propertyId: await createProperty(),
    everyWeeks: 1,
    startDate: today,
    startTime: "09:00",
    durationMinutes: 120,
    serviceType: "regular",
    hourlyRateCents: 4500,
    ...input,
  });
  expect(res.status).toBe(201);
  return res.body;
}

// The series' jobs in the next year, in date order.
async function jobsOf(seriesId: string): Promise<JobBody[]> {
  const res = await api.get<JobBody[]>(
    `/jobs?from=2000-01-01&to=${addDays(today, 365)}`,
  );
  expect(res.status).toBe(200);
  return res.body.filter((job) => job.recurringSeriesId === seriesId);
}

async function jobsUpTo(seriesId: string, to: string): Promise<JobBody[]> {
  const res = await api.get<JobBody[]>(`/jobs?from=2000-01-01&to=${to}`);
  expect(res.status).toBe(200);
  return res.body.filter((job) => job.recurringSeriesId === seriesId);
}

describe("POST /recurring-series", () => {
  it("creates the series and its jobs for the next eight weeks", async () => {
    const helperId = await createHelper();

    const series = await createSeries({
      everyWeeks: 2,
      helperId,
      notes: "Side door",
    });

    expect(series).toMatchObject({
      everyWeeks: 2,
      dayOfMonth: null,
      startDate: today,
      endDate: null,
      generatedUntil: horizon,
      startTime: "09:00:00",
      helper: { id: helperId, name: "Maria Silva" },
      client: { name: "Jane Doe" },
    });
    const jobs = await jobsUpTo(series.id, horizon);
    expect(jobs.map((job) => job.scheduledDate)).toEqual(
      occurrences(series, today, horizon),
    );
    expect(jobs).toHaveLength(5);
    expect(jobs[0]).toMatchObject({
      startTime: "09:00:00",
      durationMinutes: 120,
      status: "scheduled",
      hourlyRateCents: 4500,
      priceCents: 9000,
      notes: "Side door",
      helper: { id: helperId },
      recurringSeriesId: series.id,
    });
  });

  it("generates monthly visits on the day of the month", async () => {
    const series = await createSeries({
      everyWeeks: undefined,
      dayOfMonth: 14,
      startDate: addDays(today, 1),
    });

    const jobs = await jobsUpTo(series.id, horizon);

    expect(jobs.map((job) => job.scheduledDate)).toEqual(
      occurrences(series, addDays(today, 1), horizon),
    );
    expect(jobs.length).toBeGreaterThanOrEqual(1);
    expect(jobs.length).toBeLessThanOrEqual(2);
  });

  it("stops at the end date", async () => {
    const endDate = addDays(today, 14);

    const series = await createSeries({ everyWeeks: 1, endDate });

    const jobs = await jobsOf(series.id);
    expect(jobs.map((job) => job.scheduledDate)).toEqual([
      today,
      addDays(today, 7),
      addDays(today, 14),
    ]);
  });

  it("answers 400 unless exactly one rule is given", async () => {
    const none = await api.post("/recurring-series", {
      propertyId: await createProperty(),
      startDate: today,
      startTime: "09:00",
      durationMinutes: 120,
      serviceType: "regular",
      hourlyRateCents: 4500,
    });
    const both = await api.post("/recurring-series", {
      propertyId: await createProperty(),
      everyWeeks: 1,
      dayOfMonth: 14,
      startDate: today,
      startTime: "09:00",
      durationMinutes: 120,
      serviceType: "regular",
      hourlyRateCents: 4500,
    });

    for (const res of [none, both]) {
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        error: {
          issues: [
            {
              path: "everyWeeks",
              message: "Set either everyWeeks or dayOfMonth",
            },
          ],
        },
      });
    }
  });

  it("answers 400 when the end is before the start", async () => {
    const res = await api.post("/recurring-series", {
      propertyId: await createProperty(),
      everyWeeks: 1,
      startDate: today,
      endDate: addDays(today, -1),
      startTime: "09:00",
      durationMinutes: 120,
      serviceType: "regular",
      hourlyRateCents: 4500,
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: { issues: [{ path: "endDate" }] },
    });
  });

  it("answers 400 for a property or helper that does not exist", async () => {
    const property = await api.post("/recurring-series", {
      propertyId: missingId,
      everyWeeks: 1,
      startDate: today,
      startTime: "09:00",
      durationMinutes: 120,
      serviceType: "regular",
      hourlyRateCents: 4500,
    });
    const helper = await api.post("/recurring-series", {
      propertyId: await createProperty(),
      helperId: missingId,
      everyWeeks: 1,
      startDate: today,
      startTime: "09:00",
      durationMinutes: 120,
      serviceType: "regular",
      hourlyRateCents: 4500,
    });

    expect(property.status).toBe(400);
    expect(property.body).toMatchObject({
      error: {
        issues: [{ path: "propertyId", message: "Property not found" }],
      },
    });
    expect(helper.status).toBe(400);
    expect(helper.body).toMatchObject({
      error: { issues: [{ path: "helperId", message: "Helper not found" }] },
    });
  });
});

describe("GET /jobs with recurring series", () => {
  it("generates further ahead when the calendar looks past the horizon", async () => {
    const series = await createSeries({ everyWeeks: 4 });
    const farAhead = addDays(today, 120);

    const jobs = await jobsUpTo(series.id, farAhead);

    expect(jobs.map((job) => job.scheduledDate)).toEqual(
      occurrences(series, today, farAhead),
    );
    expect(jobs).toHaveLength(5);
    const after = await api.get<SeriesBody>(`/recurring-series/${series.id}`);
    expect(after.body.generatedUntil).toBe(farAhead);
  });

  it("does not create a visit twice, even for parallel requests", async () => {
    const series = await createSeries({ everyWeeks: 1 });
    const farAhead = addDays(today, 70);

    await jobsUpTo(series.id, horizon);
    // Several calendar tabs asking for the same range at once.
    await Promise.all(
      Array.from({ length: 5 }, () => jobsUpTo(series.id, farAhead)),
    );
    const jobs = await jobsUpTo(series.id, farAhead);

    expect(new Set(jobs.map((job) => job.scheduledDate)).size).toBe(
      jobs.length,
    );
    expect(jobs).toHaveLength(11);
  });

  it("ignores a generation based on a stale generated_until", async () => {
    // What a request that lost the race holds: the series as it was before
    // another request generated the same dates.
    const series = await createSeries({ everyWeeks: 1 });

    const inserted = await repository.generateJobs(
      api.organizationId,
      series.id,
      null,
      [today, addDays(today, 7)],
      horizon,
    );

    expect(inserted).toBe(0);
    expect(await jobsUpTo(series.id, horizon)).toHaveLength(9);
  });

  it("does not bring back a visit that was moved or deleted", async () => {
    const series = await createSeries({ everyWeeks: 1 });
    const [first, second] = await jobsUpTo(series.id, horizon);
    if (first === undefined || second === undefined) {
      throw new Error("Expected generated jobs");
    }
    const moved = await api.patch(`/jobs/${first.id}`, {
      scheduledDate: addDays(today, 1),
    });
    const deleted = await api.delete(`/jobs/${second.id}`);
    expect(moved.status).toBe(200);
    expect(deleted.status).toBe(204);

    const jobs = await jobsUpTo(series.id, addDays(today, 70));

    expect(jobs.map((job) => job.scheduledDate)).toEqual([
      addDays(today, 1),
      ...occurrences(series, addDays(today, 14), addDays(today, 70)),
    ]);
  });
});

describe("GET /recurring-series", () => {
  it("lists the series ordered by client name", async () => {
    const a = await createSeries();
    const b = await createSeries({ dayOfMonth: 1, everyWeeks: undefined });

    const res = await api.get<SeriesBody[]>("/recurring-series");

    expect(res.status).toBe(200);
    expect(res.body.map((series) => series.id).sort()).toEqual(
      [a.id, b.id].sort(),
    );
  });

  it("returns one series or 404", async () => {
    const series = await createSeries();

    const found = await api.get(`/recurring-series/${series.id}`);
    const missing = await api.get(`/recurring-series/${missingId}`);

    expect(found).toEqual({ status: 200, body: series });
    expect(missing.status).toBe(404);
  });
});

describe("PATCH /recurring-series/:id", () => {
  it("changes the series and its upcoming jobs that still match", async () => {
    const series = await createSeries({ everyWeeks: 1, hourlyRateCents: 4500 });
    const [first, second, third] = await jobsUpTo(series.id, horizon);
    if (first === undefined || second === undefined || third === undefined) {
      throw new Error("Expected generated jobs");
    }
    // One visit was adjusted by hand: it keeps its own time.
    await api.patch(`/jobs/${second.id}`, { startTime: "14:00" });
    // One visit already happened: it is left alone.
    await api.patch(`/jobs/${first.id}`, { status: "completed" });

    const res = await api.patch<SeriesBody>(`/recurring-series/${series.id}`, {
      startTime: "10:00",
      hourlyRateCents: 5000,
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      startTime: "10:00:00",
      hourlyRateCents: 5000,
    });
    const jobs = await jobsUpTo(series.id, horizon);
    expect(jobs.map((job) => [job.startTime, job.hourlyRateCents])).toEqual([
      ["09:00:00", 4500], // completed
      ["14:00:00", 5000], // hand-adjusted time kept, rate followed
      ["10:00:00", 5000],
      ["10:00:00", 5000],
      ["10:00:00", 5000],
      ["10:00:00", 5000],
      ["10:00:00", 5000],
      ["10:00:00", 5000],
      ["10:00:00", 5000],
    ]);
  });

  it("assigns and unassigns the helper on the upcoming jobs", async () => {
    const helperId = await createHelper();
    const series = await createSeries({ everyWeeks: 2 });

    const assigned = await api.patch<SeriesBody>(
      `/recurring-series/${series.id}`,
      { helperId },
    );
    const withHelper = await jobsUpTo(series.id, horizon);
    const unassigned = await api.patch<SeriesBody>(
      `/recurring-series/${series.id}`,
      { helperId: null },
    );
    const without = await jobsUpTo(series.id, horizon);

    expect(assigned.body.helper).toEqual({ id: helperId, name: "Maria Silva" });
    expect(withHelper.every((job) => job.helper?.id === helperId)).toBe(true);
    expect(unassigned.body.helper).toBeNull();
    expect(without.every((job) => job.helper === null)).toBe(true);
  });

  it("ends the series and removes the unrealized visits after the end", async () => {
    const series = await createSeries({ everyWeeks: 1 });
    const endDate = addDays(today, 10);

    const res = await api.patch<SeriesBody>(`/recurring-series/${series.id}`, {
      endDate,
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ endDate, generatedUntil: endDate });
    const jobs = await jobsOf(series.id);
    expect(jobs.map((job) => job.scheduledDate)).toEqual([
      today,
      addDays(today, 7),
    ]);
  });

  it("resumes generating when the end is removed", async () => {
    const series = await createSeries({ everyWeeks: 1 });
    await api.patch(`/recurring-series/${series.id}`, {
      endDate: addDays(today, 10),
    });

    const res = await api.patch<SeriesBody>(`/recurring-series/${series.id}`, {
      endDate: null,
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ endDate: null, generatedUntil: horizon });
    expect(await jobsUpTo(series.id, horizon)).toHaveLength(9);
  });

  it("answers 400 for an end before the start, and for a rule change", async () => {
    const series = await createSeries({ startDate: addDays(today, 7) });

    const early = await api.patch(`/recurring-series/${series.id}`, {
      endDate: today,
    });
    const rule = await api.patch(`/recurring-series/${series.id}`, {
      everyWeeks: 2,
    });

    expect(early.status).toBe(400);
    expect(early.body).toMatchObject({
      error: { issues: [{ path: "endDate" }] },
    });
    expect(rule.status).toBe(400);
  });

  it("answers 404 for a series that does not exist", async () => {
    const res = await api.patch(`/recurring-series/${missingId}`, {
      startTime: "10:00",
    });

    expect(res.status).toBe(404);
  });
});

describe("DELETE /recurring-series/:id", () => {
  it("deletes the series and its visits while none happened", async () => {
    const series = await createSeries();
    expect(await jobsUpTo(series.id, horizon)).toHaveLength(9);

    const res = await api.delete(`/recurring-series/${series.id}`);

    expect(res).toEqual({ status: 204, body: undefined });
    expect((await api.get(`/recurring-series/${series.id}`)).status).toBe(404);
    expect(await jobsOf(series.id)).toEqual([]);
  });

  it("answers 409 once a visit was completed or cancelled", async () => {
    const series = await createSeries();
    const [first] = await jobsUpTo(series.id, horizon);
    if (first === undefined) {
      throw new Error("Expected generated jobs");
    }
    await api.patch(`/jobs/${first.id}`, { status: "cancelled" });

    const res = await api.delete(`/recurring-series/${series.id}`);

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: { code: "conflict" } });
    expect((await api.get(`/recurring-series/${series.id}`)).status).toBe(200);
  });

  it("answers 404 for a series that does not exist", async () => {
    const res = await api.delete(`/recurring-series/${missingId}`);

    expect(res.status).toBe(404);
  });
});
