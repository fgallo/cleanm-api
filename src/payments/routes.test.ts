import { describe, expect, it } from "vitest";

import { createOrganization, startApi } from "../../test/api.ts";
import * as clients from "../clients/repository.ts";
import * as invoices from "../invoices/repository.ts";
import * as jobs from "../jobs/repository.ts";
import * as organizations from "../organizations/repository.ts";
import * as properties from "../properties/repository.ts";

const api = await startApi();

const missingId = "00000000-0000-7000-8000-000000000000";

const address = {
  addressLine1: "123 Example St",
  city: "Toronto",
  province: "ON",
  postalCode: "M5V 0A1",
};

type PaymentBody = {
  id: string;
  invoiceId: string;
  paidOn: string;
  method: string;
  amountCents: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type InvoiceBody = {
  id: string;
  totalCents: number;
  paidCents: number;
  amountDueCents: number;
  paid: boolean;
  payments: Array<{
    id: string;
    paidOn: string;
    method: string;
    amountCents: number;
    notes: string | null;
  }>;
};

// A visit of 150 minutes at $45/h: an invoice of 11250 cents.
async function createInvoice(): Promise<InvoiceBody> {
  const client = await api.post<{ id: string }>("/clients", {
    name: "Jane Doe",
  });
  const property = await api.post<{ id: string }>(
    `/clients/${client.body.id}/properties`,
    address,
  );
  const job = await api.post<{ id: string }>("/jobs", {
    propertyId: property.body.id,
    scheduledDate: "2026-10-14",
    startTime: "09:00",
    durationMinutes: 150,
    serviceType: "regular",
    hourlyRateCents: 4500,
  });
  const invoice = await api.post<InvoiceBody>("/invoices", {
    jobId: job.body.id,
  });
  expect(invoice.status).toBe(201);
  return invoice.body;
}

async function createPayment(
  invoiceId: string,
  input: object = {},
): Promise<PaymentBody> {
  const res = await api.post<PaymentBody>(`/invoices/${invoiceId}/payments`, {
    method: "e_transfer",
    amountCents: 5000,
    ...input,
  });
  expect(res.status).toBe(201);
  return res.body;
}

async function getInvoice(id: string): Promise<InvoiceBody> {
  const res = await api.get<InvoiceBody>(`/invoices/${id}`);
  expect(res.status).toBe(200);
  return res.body;
}

// An invoice that exists, but in an organization the API is not serving.
async function createInvoiceElsewhere(): Promise<{
  organizationId: string;
  invoiceId: string;
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
  const invoice = await invoices.createInvoice(organizationId, {
    jobId: job.id,
    issueDate: "2026-10-16",
    description: "Regular cleaning",
  });
  if (invoice === undefined) {
    throw new Error("Expected the invoice to be created");
  }
  return { organizationId, invoiceId: invoice.id };
}

describe("POST /invoices/:invoiceId/payments", () => {
  it("records a payment, today by default", async () => {
    const invoice = await createInvoice();
    const today = await organizations.today(api.organizationId);

    const res = await api.post(`/invoices/${invoice.id}/payments`, {
      method: "cash",
      amountCents: 5000,
    });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      invoiceId: invoice.id,
      paidOn: today,
      method: "cash",
      amountCents: 5000,
      notes: null,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });

  it("shows on the invoice, which is paid once the payments cover the total", async () => {
    const invoice = await createInvoice();
    expect(invoice).toMatchObject({
      totalCents: 11250,
      paidCents: 0,
      amountDueCents: 11250,
      paid: false,
      payments: [],
    });

    const first = await createPayment(invoice.id, {
      paidOn: "2026-10-16",
      amountCents: 5000,
      notes: "Half now",
    });
    expect(await getInvoice(invoice.id)).toMatchObject({
      paidCents: 5000,
      amountDueCents: 6250,
      paid: false,
      payments: [
        {
          id: first.id,
          paidOn: "2026-10-16",
          method: "e_transfer",
          amountCents: 5000,
          notes: "Half now",
        },
      ],
    });

    const second = await createPayment(invoice.id, {
      paidOn: "2026-10-20",
      method: "cash",
      amountCents: 6250,
    });
    expect(await getInvoice(invoice.id)).toMatchObject({
      paidCents: 11250,
      amountDueCents: 0,
      paid: true,
      payments: [{ id: first.id }, { id: second.id }],
    });
  });

  it("answers 400 for a payment above the amount due", async () => {
    const invoice = await createInvoice();
    await createPayment(invoice.id, { amountCents: 5000 });

    const res = await api.post(`/invoices/${invoice.id}/payments`, {
      method: "e_transfer",
      amountCents: 6251,
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: {
        code: "validation_error",
        issues: [
          {
            path: "amountCents",
            message: "Must not exceed the amount due of 6250",
          },
        ],
      },
    });
    expect((await getInvoice(invoice.id)).paidCents).toBe(5000);
  });

  it("answers 400 for any payment on a paid invoice", async () => {
    const invoice = await createInvoice();
    await createPayment(invoice.id, { amountCents: 11250 });

    const res = await api.post(`/invoices/${invoice.id}/payments`, {
      method: "cash",
      amountCents: 1,
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: {
        issues: [
          { path: "amountCents", message: expect.stringContaining("0") },
        ],
      },
    });
  });

  it("answers 404 for an invoice that does not exist or belongs elsewhere", async () => {
    const { invoiceId } = await createInvoiceElsewhere();

    for (const id of [missingId, invoiceId]) {
      const res = await api.post(`/invoices/${id}/payments`, {
        method: "cash",
        amountCents: 100,
      });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({
        error: { code: "not_found", message: "Invoice not found" },
      });
    }
  });

  it("answers 400 for invalid fields", async () => {
    const invoice = await createInvoice();

    const res = await api.post(`/invoices/${invoice.id}/payments`, {
      paidOn: "16/10/2026",
      method: "card",
      amountCents: 0,
      notes: "",
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: {
        code: "validation_error",
        issues: [
          { path: "paidOn" },
          { path: "method" },
          { path: "amountCents" },
          { path: "notes" },
        ],
      },
    });
  });
});

describe("GET /payments/:id", () => {
  it("returns the payment", async () => {
    const invoice = await createInvoice();
    const payment = await createPayment(invoice.id);

    const res = await api.get(`/payments/${payment.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(payment);
  });

  it("answers 404 for a payment that does not exist", async () => {
    const res = await api.get(`/payments/${missingId}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: "not_found", message: "Payment not found" },
    });
  });
});

describe("PATCH /payments/:id", () => {
  it("edits the date, the method, the amount and the notes", async () => {
    const invoice = await createInvoice();
    const payment = await createPayment(invoice.id);

    const res = await api.patch<PaymentBody>(`/payments/${payment.id}`, {
      paidOn: "2026-10-18",
      method: "cash",
      amountCents: 11250,
      notes: "Paid in full after all",
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ...payment,
      paidOn: "2026-10-18",
      method: "cash",
      amountCents: 11250,
      notes: "Paid in full after all",
      updatedAt: expect.any(String),
    });
    expect(await getInvoice(invoice.id)).toMatchObject({
      paidCents: 11250,
      paid: true,
    });
  });

  it("lets the amount grow by what is still due, not more", async () => {
    const invoice = await createInvoice();
    const first = await createPayment(invoice.id, { amountCents: 5000 });
    await createPayment(invoice.id, { amountCents: 6000 });

    const over = await api.patch(`/payments/${first.id}`, {
      amountCents: 5251,
    });
    expect(over.status).toBe(400);
    expect(over.body).toMatchObject({
      error: {
        issues: [
          {
            path: "amountCents",
            message: "Must not exceed the amount due of 5250",
          },
        ],
      },
    });

    const exact = await api.patch(`/payments/${first.id}`, {
      amountCents: 5250,
    });
    expect(exact.status).toBe(200);
    expect(await getInvoice(invoice.id)).toMatchObject({
      amountDueCents: 0,
      paid: true,
    });
  });

  it("clears the notes set to null and answers 400 for an empty patch", async () => {
    const invoice = await createInvoice();
    const payment = await createPayment(invoice.id, { notes: "Something" });

    const cleared = await api.patch<PaymentBody>(`/payments/${payment.id}`, {
      notes: null,
    });
    expect(cleared.status).toBe(200);
    expect(cleared.body.notes).toBeNull();

    expect((await api.patch(`/payments/${payment.id}`, {})).status).toBe(400);
  });

  it("answers 404 for a payment that does not exist", async () => {
    const res = await api.patch(`/payments/${missingId}`, { method: "cash" });

    expect(res.status).toBe(404);
  });
});

describe("DELETE /payments/:id", () => {
  it("deletes the payment and the invoice owes the amount again", async () => {
    const invoice = await createInvoice();
    const payment = await createPayment(invoice.id, { amountCents: 11250 });
    expect((await getInvoice(invoice.id)).paid).toBe(true);

    const res = await api.delete(`/payments/${payment.id}`);

    expect(res.status).toBe(204);
    expect((await api.get(`/payments/${payment.id}`)).status).toBe(404);
    expect(await getInvoice(invoice.id)).toMatchObject({
      paidCents: 0,
      amountDueCents: 11250,
      paid: false,
      payments: [],
    });
  });

  it("answers 404 for a payment that does not exist", async () => {
    const res = await api.delete(`/payments/${missingId}`);

    expect(res.status).toBe(404);
  });
});

describe("invoices and their payments", () => {
  it("refuses to delete an invoice with payments, until they are gone", async () => {
    const invoice = await createInvoice();
    const payment = await createPayment(invoice.id);

    const refused = await api.delete(`/invoices/${invoice.id}`);
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({ error: { code: "conflict" } });

    await api.delete(`/payments/${payment.id}`);
    expect((await api.delete(`/invoices/${invoice.id}`)).status).toBe(204);
  });

  it("shows a negative amount due when the invoice is edited below what was paid", async () => {
    const invoice = await createInvoice();
    await createPayment(invoice.id, { amountCents: 11250 });

    const res = await api.patch<InvoiceBody>(`/invoices/${invoice.id}`, {
      fixedPriceCents: 10000,
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      totalCents: 10000,
      paidCents: 11250,
      amountDueCents: -1250,
      paid: true,
    });
  });
});
