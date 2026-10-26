import { describe, expect, it } from "vitest";

import { startApi } from "../../test/api.ts";
import type { Invoice } from "../invoices/repository.ts";
import type { Job } from "../jobs/repository.ts";
import * as organizations from "../organizations/repository.ts";
import { addDays } from "../recurring-series/occurrences.ts";
import { createSampleData } from "./sample-data.ts";

const api = await startApi();

async function jobsBetween(from: string, to: string): Promise<Job[]> {
  const res = await api.get<Job[]>(`/jobs?from=${from}&to=${to}`);
  expect(res.status).toBe(200);
  return res.body;
}

describe("createSampleData", () => {
  it("fills the organization with clients, helpers, series, visits, invoices and payments", async () => {
    const summary = await createSampleData(api.organizationId);

    expect(summary).toMatchObject({
      clients: 8,
      properties: 9,
      helpers: 3,
      recurringSeries: 6,
    });
    expect(summary.jobs).toBeGreaterThan(summary.invoices);
    expect(summary.invoices).toBeGreaterThan(summary.payments);
    expect(summary.payments).toBeGreaterThan(0);

    const clients = await api.get<unknown[]>("/clients");
    expect(clients.body).toHaveLength(8);
    const helpers = await api.get<Array<{ active: boolean }>>("/helpers");
    expect(helpers.body.filter((h) => !h.active)).toHaveLength(1);
    const series = await api.get<unknown[]>("/recurring-series");
    expect(series.body).toHaveLength(6);
  });

  it("settles the visits before today and schedules at least eight weeks ahead", async () => {
    await createSampleData(api.organizationId);
    const today = await organizations.today(api.organizationId);

    const lastWeek = await jobsBetween(addDays(today, -7), addDays(today, -1));
    expect(lastWeek.length).toBeGreaterThan(0);
    expect(lastWeek.every((j) => j.status !== "scheduled")).toBe(true);
    expect(lastWeek.some((j) => j.status === "completed")).toBe(true);

    const eighthWeek = await jobsBetween(
      addDays(today, 50),
      addDays(today, 56),
    );
    expect(eighthWeek.length).toBeGreaterThan(0);
    expect(eighthWeek.every((j) => j.status === "scheduled")).toBe(true);
  });

  it("leaves invoices paid, partly paid and outstanding, and recent work uninvoiced", async () => {
    await createSampleData(api.organizationId);
    const today = await organizations.today(api.organizationId);

    const res = await api.get<Invoice[]>(
      `/invoices?from=${addDays(today, -150)}&to=${today}`,
    );
    expect(res.status).toBe(200);
    const states = res.body.map((invoice) =>
      invoice.paid
        ? "paid"
        : invoice.paidCents > 0
          ? "partly paid"
          : "outstanding",
    );
    expect(new Set(states)).toEqual(
      new Set(["paid", "partly paid", "outstanding"]),
    );

    const recent = await jobsBetween(addDays(today, -14), addDays(today, -1));
    const completed = recent.filter((j) => j.status === "completed");
    expect(completed.some((j) => j.invoice === null)).toBe(true);
    expect(completed.some((j) => j.invoice !== null)).toBe(true);
  });
});
