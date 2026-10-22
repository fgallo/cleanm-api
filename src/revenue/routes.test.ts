import { describe, expect, it } from "vitest";

import { createOrganization, startApi } from "../../test/api.ts";
import * as clients from "../clients/repository.ts";
import * as invoices from "../invoices/repository.ts";
import * as jobs from "../jobs/repository.ts";
import * as organizations from "../organizations/repository.ts";
import * as payments from "../payments/repository.ts";
import * as properties from "../properties/repository.ts";

const api = await startApi();

type Month = {
  month: string;
  invoicedCents: number;
  paidCents: number;
  outstandingCents: number;
  uninvoicedCents: number;
  receivedCents: number;
};

type Revenue = { year: number; months: Month[] };

const address = {
  addressLine1: "123 Example St",
  city: "Toronto",
  province: "ON",
  postalCode: "M5V 0A1",
};

const zero = {
  invoicedCents: 0,
  paidCents: 0,
  outstandingCents: 0,
  uninvoicedCents: 0,
  receivedCents: 0,
};

async function createProperty(): Promise<string> {
  const client = await api.post<{ id: string }>("/clients", {
    name: "Jane Doe",
  });
  const property = await api.post<{ id: string }>(
    `/clients/${client.body.id}/properties`,
    address,
  );
  expect(property.status).toBe(201);
  return property.body.id;
}

// A visit of 150 minutes at $45/h (11250 cents) unless a fixed price is
// given; completed unless told otherwise.
async function createJob(
  propertyId: string,
  scheduledDate: string,
  input: object = {},
): Promise<string> {
  const res = await api.post<{ id: string }>("/jobs", {
    propertyId,
    scheduledDate,
    startTime: "09:00",
    durationMinutes: 150,
    serviceType: "regular",
    hourlyRateCents: 4500,
    status: "completed",
    ...input,
  });
  expect(res.status).toBe(201);
  return res.body.id;
}

async function createInvoice(
  jobId: string,
  issueDate: string,
): Promise<string> {
  const res = await api.post<{ id: string }>("/invoices", { jobId, issueDate });
  expect(res.status).toBe(201);
  return res.body.id;
}

async function pay(
  invoiceId: string,
  paidOn: string,
  amountCents: number,
): Promise<void> {
  const res = await api.post(`/invoices/${invoiceId}/payments`, {
    method: "e_transfer",
    paidOn,
    amountCents,
  });
  expect(res.status).toBe(201);
}

async function revenue(query = "?year=2026"): Promise<Revenue> {
  const res = await api.get<Revenue>(`/revenue${query}`);
  expect(res.status).toBe(200);
  return res.body;
}

describe("GET /revenue", () => {
  it("returns twelve months of zeros when nothing happened", async () => {
    const body = await revenue();

    expect(body.year).toBe(2026);
    expect(body.months).toHaveLength(12);
    expect(body.months[0]).toEqual({ month: "2026-01", ...zero });
    expect(body.months[11]).toEqual({ month: "2026-12", ...zero });
    expect(body.months.map((m) => m.month)).toEqual(
      Array.from(
        { length: 12 },
        (_, i) => `2026-${String(i + 1).padStart(2, "0")}`,
      ),
    );
  });

  it("adds up by issue month, by payment month, and the work not invoiced yet", async () => {
    const propertyId = await createProperty();
    // Done in September, invoiced in October, paid half in October and half
    // in November.
    const september = await createJob(propertyId, "2026-09-10");
    const invoicedInOctober = await createInvoice(september, "2026-10-01");
    await pay(invoicedInOctober, "2026-10-05", 5000);
    await pay(invoicedInOctober, "2026-11-02", 6250);
    // Done in October, not invoiced.
    await createJob(propertyId, "2026-10-20");
    // Still to happen: not revenue yet.
    await createJob(propertyId, "2026-10-22", { status: "scheduled" });
    // Done and invoiced in October at a fixed price, unpaid.
    const fixed = await createJob(propertyId, "2026-10-25", {
      fixedPriceCents: 20000,
    });
    await createInvoice(fixed, "2026-10-25");

    const { months } = await revenue();

    expect(months[8]).toEqual({ month: "2026-09", ...zero });
    expect(months[9]).toEqual({
      month: "2026-10",
      invoicedCents: 31250,
      paidCents: 11250,
      outstandingCents: 20000,
      uninvoicedCents: 11250,
      receivedCents: 5000,
    });
    expect(months[10]).toEqual({
      month: "2026-11",
      ...zero,
      receivedCents: 6250,
    });
  });

  it("keeps the year apart", async () => {
    const propertyId = await createProperty();
    const job = await createJob(propertyId, "2025-12-31");
    const invoice = await createInvoice(job, "2025-12-31");
    await pay(invoice, "2026-01-02", 11250);

    const last = await revenue("?year=2025");
    const current = await revenue("?year=2026");

    expect(last.months[11]).toEqual({
      month: "2025-12",
      invoicedCents: 11250,
      paidCents: 11250,
      outstandingCents: 0,
      uninvoicedCents: 0,
      receivedCents: 0,
    });
    expect(current.months[0]).toEqual({
      month: "2026-01",
      ...zero,
      receivedCents: 11250,
    });
  });

  it("defaults to the current year on the organization's calendar", async () => {
    const today = await organizations.today(api.organizationId);

    const body = await revenue("");

    expect(body.year).toBe(Number(today.slice(0, 4)));
    expect(body.months[0]?.month).toBe(`${today.slice(0, 4)}-01`);
  });

  it("answers 400 for a year that is not a year", async () => {
    for (const year of ["abc", "1999", "2026.5"]) {
      const res = await api.get(`/revenue?year=${year}`);

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        error: { code: "validation_error", issues: [{ path: "year" }] },
      });
    }
  });

  it("does not count another organization", async () => {
    const organizationId = await createOrganization();
    const client = await clients.createClient(organizationId, {
      name: "Someone Else",
    });
    const property = await properties.createProperty(
      organizationId,
      client.id,
      address,
    );
    const job = await jobs.createJob(organizationId, {
      propertyId: property?.id ?? "",
      scheduledDate: "2026-10-14",
      startTime: "09:00",
      durationMinutes: 60,
      serviceType: "regular",
      hourlyRateCents: 4500,
      status: "completed",
    });
    const invoice = await invoices.createInvoice(organizationId, {
      jobId: job?.id ?? "",
      issueDate: "2026-10-14",
      description: "Regular cleaning",
    });
    await payments.createPayment(organizationId, invoice?.id ?? "", {
      paidOn: "2026-10-14",
      method: "cash",
      amountCents: 4500,
    });

    const { months } = await revenue();

    expect(months[9]).toEqual({ month: "2026-10", ...zero });
  });
});
