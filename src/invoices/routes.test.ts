import { describe, expect, it } from "vitest";

import { createOrganization, startApi } from "../../test/api.ts";
import * as clients from "../clients/repository.ts";
import * as jobs from "../jobs/repository.ts";
import * as organizations from "../organizations/repository.ts";
import * as properties from "../properties/repository.ts";
import * as invoices from "./repository.ts";

const api = await startApi();

const missingId = "00000000-0000-7000-8000-000000000000";

const address = {
  addressLine1: "123 Example St",
  city: "Toronto",
  province: "ON",
  postalCode: "M5V 0A1",
};

type InvoiceBody = {
  id: string;
  number: number;
  issueDate: string;
  dueDate: string | null;
  description: string;
  serviceDate: string;
  durationMinutes: number;
  hourlyRateCents: number;
  fixedPriceCents: number | null;
  subtotalCents: number;
  taxName: string | null;
  taxRateBasisPoints: number;
  taxCents: number;
  totalCents: number;
  notes: string | null;
  job: { id: string; scheduledDate: string; status: string };
  client: { id: string; name: string };
  property: { id: string; addressLine1: string };
  createdAt: string;
  updatedAt: string;
};

type JobBody = {
  id: string;
  durationMinutes: number;
  invoice: { id: string; number: number } | null;
};

const noTax = { taxName: null, taxRateBasisPoints: 0 };

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

async function createInvoice(
  jobId: string,
  input: object = {},
): Promise<InvoiceBody> {
  const res = await api.post<InvoiceBody>("/invoices", { jobId, ...input });
  expect(res.status).toBe(201);
  return res.body;
}

// A job that exists, but in an organization the API is not serving.
async function createJobElsewhere(): Promise<{
  organizationId: string;
  jobId: string;
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
  const job = await jobs.createJob(organizationId, {
    propertyId: property.id,
    scheduledDate: "2026-10-14",
    startTime: "09:00",
    durationMinutes: 60,
    serviceType: "regular",
    hourlyRateCents: 4500,
  });
  if (job === undefined) {
    throw new Error("Expected the job to be created");
  }
  return { organizationId, jobId: job.id };
}

describe("POST /invoices", () => {
  it("creates an invoice from a job, with the job, client and property embedded", async () => {
    const { clientId, propertyId } = await createProperty();
    const job = await createJob(propertyId);
    const today = await organizations.today(api.organizationId);

    const res = await api.post("/invoices", { jobId: job.id });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      number: expect.any(Number),
      issueDate: today,
      dueDate: null,
      description: "Regular cleaning",
      serviceDate: "2026-10-14",
      durationMinutes: 150,
      hourlyRateCents: 4500,
      fixedPriceCents: null,
      subtotalCents: 11250,
      fixedDiscountCents: null,
      discountBasisPoints: null,
      discountCents: 0,
      discountDescription: null,
      taxName: null,
      taxRateBasisPoints: 0,
      taxCents: 0,
      totalCents: 11250,
      paidCents: 0,
      amountDueCents: 11250,
      paid: false,
      payments: [],
      notes: null,
      job: { id: job.id, scheduledDate: "2026-10-14", status: "scheduled" },
      client: { id: clientId, name: "Jane Doe", email: null, phone: null },
      property: {
        id: propertyId,
        ...address,
        addressLine2: null,
        country: "CA",
      },
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });

  it("numbers invoices sequentially", async () => {
    const { propertyId } = await createProperty();
    const first = await createInvoice((await createJob(propertyId)).id);
    const second = await createInvoice((await createJob(propertyId)).id);

    expect(second.number).toBe(first.number + 1);
  });

  it("takes the dates, the line and the notes", async () => {
    const { propertyId } = await createProperty();
    const job = await createJob(propertyId);

    const invoice = await createInvoice(job.id, {
      issueDate: "2026-10-16",
      dueDate: "2026-10-30",
      description: "Regular cleaning, windows included",
      notes: "Second key under the mat",
    });

    expect(invoice).toMatchObject({
      issueDate: "2026-10-16",
      dueDate: "2026-10-30",
      description: "Regular cleaning, windows included",
      notes: "Second key under the mat",
    });
  });

  it.each([
    ["deep", "Deep cleaning"],
    ["move_in", "Move-in cleaning"],
    ["move_out", "Move-out cleaning"],
  ])("describes a %s job as %s", async (serviceType, description) => {
    const { propertyId } = await createProperty();
    const job = await createJob(propertyId, { serviceType });

    expect((await createInvoice(job.id)).description).toBe(description);
  });

  it("uses the fixed price of the job when it has one", async () => {
    const { propertyId } = await createProperty();
    const job = await createJob(propertyId, { fixedPriceCents: 20000 });

    expect(await createInvoice(job.id)).toMatchObject({
      hourlyRateCents: 4500,
      fixedPriceCents: 20000,
      subtotalCents: 20000,
      totalCents: 20000,
    });
  });

  it("copies the organization's tax at creation and keeps it", async () => {
    const { propertyId } = await createProperty();
    const job = await createJob(propertyId);
    await api.patch("/organization", {
      taxName: "HST",
      taxRateBasisPoints: 1300,
    });
    const invoice = await createInvoice(job.id);
    await api.patch("/organization", noTax);

    const taxed = {
      subtotalCents: 11250,
      taxName: "HST",
      taxRateBasisPoints: 1300,
      taxCents: 1463,
      totalCents: 12713,
    };
    expect(invoice).toMatchObject(taxed);
    expect((await api.get(`/invoices/${invoice.id}`)).body).toMatchObject(
      taxed,
    );
  });

  it("keeps its copy of the pricing when the job changes afterwards", async () => {
    const { propertyId } = await createProperty();
    const job = await createJob(propertyId);
    const invoice = await createInvoice(job.id);

    await api.patch(`/jobs/${job.id}`, {
      durationMinutes: 60,
      hourlyRateCents: 5000,
    });

    expect((await api.get(`/invoices/${invoice.id}`)).body).toMatchObject({
      durationMinutes: 150,
      hourlyRateCents: 4500,
      subtotalCents: 11250,
    });
  });

  it("answers 400 for a job that does not exist", async () => {
    const res = await api.post("/invoices", { jobId: missingId });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: {
        code: "validation_error",
        issues: [{ path: "jobId", message: "Job not found" }],
      },
    });
  });

  it("answers 400 for a job of another organization", async () => {
    const { jobId } = await createJobElsewhere();

    const res = await api.post("/invoices", { jobId });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: { issues: [{ path: "jobId", message: "Job not found" }] },
    });
  });

  it("answers 409 for a job that is already invoiced", async () => {
    const { propertyId } = await createProperty();
    const job = await createJob(propertyId);
    await createInvoice(job.id);

    const res = await api.post("/invoices", { jobId: job.id });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      error: {
        code: "conflict",
        message: "Cannot invoice: the job is already invoiced",
      },
    });
  });

  it.each(["estimated", "cancelled"])(
    "answers 409 for a job that is %s",
    async (status) => {
      const { propertyId } = await createProperty();
      const job = await createJob(propertyId, { status });

      const res = await api.post("/invoices", { jobId: job.id });

      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({
        error: {
          code: "conflict",
          message: `Cannot invoice a job that is ${status}`,
        },
      });
    },
  );

  it("answers 400 for a dueDate before the issueDate", async () => {
    const { propertyId } = await createProperty();
    const job = await createJob(propertyId);

    const explicit = await api.post("/invoices", {
      jobId: job.id,
      issueDate: "2026-10-16",
      dueDate: "2026-10-15",
    });
    const beforeToday = await api.post("/invoices", {
      jobId: job.id,
      dueDate: "2000-01-01",
    });

    for (const res of [explicit, beforeToday]) {
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        error: {
          issues: [
            { path: "dueDate", message: "Must not be before issueDate" },
          ],
        },
      });
    }
  });

  it("takes a fixed discount off before the tax", async () => {
    const { propertyId } = await createProperty();
    const job = await createJob(propertyId);
    await api.patch("/organization", {
      taxName: "HST",
      taxRateBasisPoints: 1300,
    });
    const invoice = await createInvoice(job.id, {
      fixedDiscountCents: 1250,
      discountDescription: "Referral for 1 cleaning",
    });
    await api.patch("/organization", noTax);

    expect(invoice).toMatchObject({
      subtotalCents: 11250,
      fixedDiscountCents: 1250,
      discountBasisPoints: null,
      discountCents: 1250,
      discountDescription: "Referral for 1 cleaning",
      taxCents: 1300,
      totalCents: 11300,
    });
  });

  it("takes a percentage discount off the subtotal", async () => {
    const { propertyId } = await createProperty();
    const job = await createJob(propertyId);

    const invoice = await createInvoice(job.id, { discountBasisPoints: 1000 });

    expect(invoice).toMatchObject({
      subtotalCents: 11250,
      fixedDiscountCents: null,
      discountBasisPoints: 1000,
      discountCents: 1125,
      totalCents: 10125,
    });
  });

  it("answers 400 for a discount given in both forms", async () => {
    const { propertyId } = await createProperty();
    const job = await createJob(propertyId);

    const res = await api.post("/invoices", {
      jobId: job.id,
      fixedDiscountCents: 500,
      discountBasisPoints: 1000,
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: {
        issues: [
          {
            path: "discountBasisPoints",
            message: "Use either fixedDiscountCents or discountBasisPoints",
          },
        ],
      },
    });
  });

  it("answers 400 for a fixed discount above the subtotal", async () => {
    const { propertyId } = await createProperty();
    const job = await createJob(propertyId);

    const res = await api.post("/invoices", {
      jobId: job.id,
      fixedDiscountCents: 11251,
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: {
        issues: [
          {
            path: "fixedDiscountCents",
            message: "Must not exceed the subtotal",
          },
        ],
      },
    });
  });

  it("answers 400 for invalid fields", async () => {
    const res = await api.post("/invoices", {
      jobId: "not-a-uuid",
      issueDate: "16/10/2026",
      description: "",
      notes: 42,
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: {
        code: "validation_error",
        issues: [
          { path: "jobId" },
          { path: "issueDate" },
          { path: "description" },
          { path: "notes" },
        ],
      },
    });
  });

  it("invoices a job only once when two requests race, without skipping a number", async () => {
    const { propertyId } = await createProperty();
    const job = await createJob(propertyId);

    const results = await Promise.all([
      api.post<InvoiceBody>("/invoices", { jobId: job.id }),
      api.post<InvoiceBody>("/invoices", { jobId: job.id }),
    ]);

    expect(results.map((res) => res.status).sort((a, b) => a - b)).toEqual([
      201, 409,
    ]);
    const winner = results.find((res) => res.status === 201)?.body;
    const next = await createInvoice((await createJob(propertyId)).id);
    expect(next.number).toBe((winner?.number ?? NaN) + 1);
  });

  it("gives distinct numbers to invoices created at the same time", async () => {
    const { propertyId } = await createProperty();
    const first = await createJob(propertyId);
    const second = await createJob(propertyId);

    const results = await Promise.all([
      api.post<InvoiceBody>("/invoices", { jobId: first.id }),
      api.post<InvoiceBody>("/invoices", { jobId: second.id }),
    ]);

    expect(results.map((res) => res.status)).toEqual([201, 201]);
    const numbers = results.map((res) => res.body.number);
    expect(new Set(numbers).size).toBe(2);
  });

  // Straight to the repository, past the route's checks: the unique
  // constraint is what stops a second invoice, and the failed statement
  // gives its number back.
  it("relies on the database to refuse a second invoice for the job", async () => {
    const { propertyId } = await createProperty();
    const job = await createJob(propertyId);
    const invoice = await createInvoice(job.id);

    const again = await invoices.createInvoice(api.organizationId, {
      jobId: job.id,
      issueDate: "2026-10-16",
      description: "Regular cleaning",
    });

    expect(again).toBeUndefined();
    const next = await createInvoice((await createJob(propertyId)).id);
    expect(next.number).toBe(invoice.number + 1);
  });
});

describe("GET /invoices", () => {
  it("lists the invoices issued in the range, newest first", async () => {
    const { propertyId } = await createProperty();
    const first = await createInvoice((await createJob(propertyId)).id, {
      issueDate: "2026-10-01",
    });
    const second = await createInvoice((await createJob(propertyId)).id, {
      issueDate: "2026-10-15",
    });
    await createInvoice((await createJob(propertyId)).id, {
      issueDate: "2026-11-01",
    });

    const res = await api.get<InvoiceBody[]>(
      "/invoices?from=2026-10-01&to=2026-10-31",
    );

    expect(res.status).toBe(200);
    expect(res.body.map((invoice) => invoice.id)).toEqual([
      second.id,
      first.id,
    ]);
  });

  it("does not list another organization's invoices", async () => {
    const { organizationId, jobId } = await createJobElsewhere();
    await invoices.createInvoice(organizationId, {
      jobId,
      issueDate: "2026-10-16",
      description: "Regular cleaning",
    });

    const res = await api.get<InvoiceBody[]>(
      "/invoices?from=2026-10-16&to=2026-10-16",
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("answers 400 for a missing or reversed range", async () => {
    expect((await api.get("/invoices")).status).toBe(400);

    const reversed = await api.get("/invoices?from=2026-10-31&to=2026-10-01");

    expect(reversed.status).toBe(400);
    expect(reversed.body).toMatchObject({
      error: { issues: [{ path: "to", message: "Must not be before from" }] },
    });
  });
});

describe("GET /invoices/:id", () => {
  it("returns the invoice", async () => {
    const { propertyId } = await createProperty();
    const invoice = await createInvoice((await createJob(propertyId)).id);

    const res = await api.get(`/invoices/${invoice.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(invoice);
  });

  it("answers 404 for an invoice that does not exist", async () => {
    const res = await api.get(`/invoices/${missingId}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: "not_found", message: "Invoice not found" },
    });
  });

  it("answers 404 for an invoice of another organization", async () => {
    const { organizationId, jobId } = await createJobElsewhere();
    const invoice = await invoices.createInvoice(organizationId, {
      jobId,
      issueDate: "2026-10-16",
      description: "Regular cleaning",
    });

    const res = await api.get(`/invoices/${invoice?.id}`);

    expect(res.status).toBe(404);
  });
});

describe("PATCH /invoices/:id", () => {
  it("edits the dates, the line and the notes", async () => {
    const { propertyId } = await createProperty();
    const invoice = await createInvoice((await createJob(propertyId)).id);

    const res = await api.patch<InvoiceBody>(`/invoices/${invoice.id}`, {
      issueDate: "2026-10-20",
      dueDate: "2026-11-19",
      serviceDate: "2026-10-15",
      description: "Deep cleaning, oven included",
      notes: "Half paid in cash",
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ...invoice,
      issueDate: "2026-10-20",
      dueDate: "2026-11-19",
      serviceDate: "2026-10-15",
      description: "Deep cleaning, oven included",
      notes: "Half paid in cash",
      updatedAt: expect.any(String),
    });
    expect((await api.get(`/invoices/${invoice.id}`)).body).toEqual(res.body);
  });

  it("switches the discount form, clearing the other one", async () => {
    const { propertyId } = await createProperty();
    const invoice = await createInvoice((await createJob(propertyId)).id, {
      discountBasisPoints: 1000,
    });

    const fixed = await api.patch(`/invoices/${invoice.id}`, {
      fixedDiscountCents: 500,
    });
    expect(fixed.status).toBe(200);
    expect(fixed.body).toMatchObject({
      fixedDiscountCents: 500,
      discountBasisPoints: null,
      discountCents: 500,
      totalCents: 10750,
    });

    const percentage = await api.patch(`/invoices/${invoice.id}`, {
      discountBasisPoints: 2000,
    });
    expect(percentage.body).toMatchObject({
      fixedDiscountCents: null,
      discountBasisPoints: 2000,
      discountCents: 2250,
      totalCents: 9000,
    });

    const labelled = await api.patch(`/invoices/${invoice.id}`, {
      discountDescription: "Loyalty",
    });
    expect(labelled.body).toMatchObject({
      discountBasisPoints: 2000,
      discountDescription: "Loyalty",
    });

    const none = await api.patch(`/invoices/${invoice.id}`, {
      discountBasisPoints: null,
      discountDescription: null,
    });
    expect(none.body).toMatchObject({
      fixedDiscountCents: null,
      discountBasisPoints: null,
      discountCents: 0,
      discountDescription: null,
      totalCents: 11250,
    });
  });

  it("answers 400 when the pricing drops below a fixed discount", async () => {
    const { propertyId } = await createProperty();
    const invoice = await createInvoice((await createJob(propertyId)).id, {
      fixedDiscountCents: 5000,
    });

    const res = await api.patch(`/invoices/${invoice.id}`, {
      durationMinutes: 60,
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: {
        issues: [
          {
            path: "fixedDiscountCents",
            message: "Must not exceed the subtotal",
          },
        ],
      },
    });
    expect((await api.get(`/invoices/${invoice.id}`)).body).toEqual(invoice);
  });

  it("recomputes the amounts from the edited pricing", async () => {
    const { propertyId } = await createProperty();
    const job = await createJob(propertyId);
    await api.patch("/organization", {
      taxName: "HST",
      taxRateBasisPoints: 1300,
    });
    const invoice = await createInvoice(job.id);
    await api.patch("/organization", noTax);

    const hourly = await api.patch(`/invoices/${invoice.id}`, {
      durationMinutes: 120,
      hourlyRateCents: 5000,
    });
    expect(hourly.body).toMatchObject({
      subtotalCents: 10000,
      taxCents: 1300,
      totalCents: 11300,
    });

    const fixed = await api.patch(`/invoices/${invoice.id}`, {
      fixedPriceCents: 9900,
    });
    expect(fixed.body).toMatchObject({
      subtotalCents: 9900,
      taxCents: 1287,
      totalCents: 11187,
    });

    const back = await api.patch(`/invoices/${invoice.id}`, {
      fixedPriceCents: null,
    });
    expect(back.body).toMatchObject({ subtotalCents: 10000 });
  });

  it("clears dueDate and notes set to null", async () => {
    const { propertyId } = await createProperty();
    const invoice = await createInvoice((await createJob(propertyId)).id, {
      dueDate: "2026-12-31",
      notes: "Something",
    });

    const res = await api.patch(`/invoices/${invoice.id}`, {
      dueDate: null,
      notes: null,
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ dueDate: null, notes: null });
  });

  it("answers 400 when the dates end up with dueDate before issueDate", async () => {
    const { propertyId } = await createProperty();
    const invoice = await createInvoice((await createJob(propertyId)).id, {
      issueDate: "2026-10-16",
      dueDate: "2026-10-30",
    });

    const dueDate = await api.patch(`/invoices/${invoice.id}`, {
      dueDate: "2026-10-15",
    });
    const issueDate = await api.patch(`/invoices/${invoice.id}`, {
      issueDate: "2026-11-01",
    });

    for (const res of [dueDate, issueDate]) {
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        error: {
          issues: [
            { path: "dueDate", message: "Must not be before issueDate" },
          ],
        },
      });
    }
    expect((await api.get(`/invoices/${invoice.id}`)).body).toEqual(invoice);
  });

  it("answers 400 for invalid fields and for an empty patch", async () => {
    const { propertyId } = await createProperty();
    const invoice = await createInvoice((await createJob(propertyId)).id);

    const invalid = await api.patch(`/invoices/${invoice.id}`, {
      durationMinutes: 0,
      hourlyRateCents: -1,
      taxRateBasisPoints: 1300,
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body).toMatchObject({
      error: {
        issues: [{ path: "durationMinutes" }, { path: "hourlyRateCents" }],
      },
    });

    expect((await api.patch(`/invoices/${invoice.id}`, {})).status).toBe(400);
  });

  it("answers 404 for an invoice that does not exist", async () => {
    const res = await api.patch(`/invoices/${missingId}`, { notes: "x" });

    expect(res.status).toBe(404);
  });
});

describe("DELETE /invoices/:id", () => {
  it("deletes the invoice and frees the job, without reusing the number", async () => {
    const { propertyId } = await createProperty();
    const job = await createJob(propertyId);
    const invoice = await createInvoice(job.id);

    const res = await api.delete(`/invoices/${invoice.id}`);

    expect(res.status).toBe(204);
    expect((await api.get(`/invoices/${invoice.id}`)).status).toBe(404);
    expect((await api.get<JobBody>(`/jobs/${job.id}`)).body.invoice).toBeNull();
    const again = await createInvoice(job.id);
    expect(again.number).toBe(invoice.number + 1);
  });

  it("answers 404 for an invoice that does not exist", async () => {
    const res = await api.delete(`/invoices/${missingId}`);

    expect(res.status).toBe(404);
  });
});

describe("jobs and their invoice", () => {
  it("shows the invoice on the job", async () => {
    const { propertyId } = await createProperty();
    const job = await createJob(propertyId);
    const invoice = await createInvoice(job.id);

    const one = await api.get<JobBody>(`/jobs/${job.id}`);
    const list = await api.get<JobBody[]>(
      "/jobs?from=2026-10-14&to=2026-10-14",
    );

    const expected = { id: invoice.id, number: invoice.number };
    expect(one.body.invoice).toEqual(expected);
    expect(list.body.map((j) => j.invoice)).toEqual([expected]);
  });

  it("refuses to delete an invoiced job", async () => {
    const { propertyId } = await createProperty();
    const job = await createJob(propertyId);
    await createInvoice(job.id);

    const res = await api.delete(`/jobs/${job.id}`);

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: { code: "conflict" } });
    expect((await api.get(`/jobs/${job.id}`)).status).toBe(200);
  });
});
