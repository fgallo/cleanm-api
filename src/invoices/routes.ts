import { Router } from "express";

import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../http/errors.ts";
import * as jobs from "../jobs/repository.ts";
import * as organizations from "../organizations/repository.ts";
import { defaultDescription } from "./description.ts";
import { renderPdf } from "./pdf/render.ts";
import { invoiceHtml } from "./pdf/template.ts";
import * as invoices from "./repository.ts";
import type { InvoicePatch } from "./repository.ts";
import {
  createInvoiceSchema,
  invoiceIdSchema,
  listInvoicesQuerySchema,
  updateInvoiceSchema,
} from "./schemas.ts";

export const invoicesRouter = Router();

invoicesRouter.get("/", async (req, res) => {
  const range = listInvoicesQuerySchema.parse(req.query);
  res.json(await invoices.listInvoices(res.locals.organizationId, range));
});

// A visit is invoiced once, before or after it happens (scheduled or
// completed). The checks here give the precise answer; the database keeps
// the guarantee when two requests race for the same job.
invoicesRouter.post("/", async (req, res) => {
  const input = createInvoiceSchema.parse(req.body);
  const job = await jobs.findJob(res.locals.organizationId, input.jobId);
  if (job === undefined) {
    throw new ValidationError([{ path: "jobId", message: "Job not found" }]);
  }
  if (job.invoice !== null) {
    throw new ConflictError("Cannot invoice: the job is already invoiced");
  }
  if (job.status !== "scheduled" && job.status !== "completed") {
    throw new ConflictError(`Cannot invoice a job that is ${job.status}`);
  }

  const issueDate =
    input.issueDate ?? (await organizations.today(res.locals.organizationId));
  assertDueDate(issueDate, input.dueDate ?? null);
  assertDiscount(input.fixedDiscountCents ?? null, job.priceCents);

  const invoice = await invoices.createInvoice(res.locals.organizationId, {
    jobId: job.id,
    issueDate,
    dueDate: input.dueDate,
    description: input.description ?? defaultDescription(job.serviceType),
    fixedDiscountCents: input.fixedDiscountCents,
    discountBasisPoints: input.discountBasisPoints,
    discountDescription: input.discountDescription,
    notes: input.notes,
  });
  if (invoice === undefined) {
    // The job was invoiced, changed or deleted since it was checked above.
    throw new ConflictError(
      "Cannot invoice: the job can no longer be invoiced",
    );
  }
  res.status(201).json(invoice);
});

invoicesRouter.get("/:id", async (req, res) => {
  const { id } = invoiceIdSchema.parse(req.params);
  const invoice = await invoices.findInvoice(res.locals.organizationId, id);
  if (invoice === undefined) {
    throw new NotFoundError("Invoice not found");
  }
  res.json(invoice);
});

// Rendered on request, never stored: the PDF always shows the invoice as it
// is now, with the organization's current details and logo.
invoicesRouter.get("/:id/pdf", async (req, res) => {
  const { id } = invoiceIdSchema.parse(req.params);
  const invoice = await invoices.findInvoice(res.locals.organizationId, id);
  if (invoice === undefined) {
    throw new NotFoundError("Invoice not found");
  }
  const [organization, logo] = await Promise.all([
    organizations.findOrganization(res.locals.organizationId),
    organizations.findLogo(res.locals.organizationId),
  ]);

  const pdf = await renderPdf(invoiceHtml({ invoice, organization, logo }));
  res
    .type("application/pdf")
    .set(
      "content-disposition",
      `inline; filename="invoice-${invoice.number}.pdf"`,
    )
    .send(pdf);
});

// The rules that span fields (dueDate against issueDate, a fixed discount
// against the subtotal) are checked on the invoice as it will be after the
// patch, since a patch may bring only some of the fields involved.
invoicesRouter.patch("/:id", async (req, res) => {
  const { id } = invoiceIdSchema.parse(req.params);
  const patch = withOneDiscountForm(updateInvoiceSchema.parse(req.body));
  const current = await invoices.findInvoice(res.locals.organizationId, id);
  if (current === undefined) {
    throw new NotFoundError("Invoice not found");
  }
  const after = { ...current, ...patch };
  assertDueDate(after.issueDate, after.dueDate);
  assertDiscount(after.fixedDiscountCents, subtotalOf(after));

  const invoice = await invoices.updateInvoice(
    res.locals.organizationId,
    id,
    patch,
  );
  if (invoice === undefined) {
    throw new NotFoundError("Invoice not found");
  }
  res.json(invoice);
});

// Frees the job for another invoice. The number is not reused.
invoicesRouter.delete("/:id", async (req, res) => {
  const { id } = invoiceIdSchema.parse(req.params);
  const deleted = await invoices.deleteInvoice(res.locals.organizationId, id);
  if (!deleted) {
    throw new NotFoundError("Invoice not found");
  }
  res.status(204).end();
});

function assertDueDate(issueDate: string, dueDate: string | null): void {
  if (dueDate !== null && dueDate < issueDate) {
    throw new ValidationError([
      { path: "dueDate", message: "Must not be before issueDate" },
    ]);
  }
}

function assertDiscount(
  fixedDiscountCents: number | null,
  subtotalCents: number,
): void {
  if (fixedDiscountCents !== null && fixedDiscountCents > subtotalCents) {
    throw new ValidationError([
      { path: "fixedDiscountCents", message: "Must not exceed the subtotal" },
    ]);
  }
}

// Setting one form of discount clears the other, so a patch that switches
// forms does not have to send both. The schema already refused both set.
function withOneDiscountForm(patch: InvoicePatch): InvoicePatch {
  if (
    patch.fixedDiscountCents !== undefined &&
    patch.fixedDiscountCents !== null
  ) {
    return { ...patch, discountBasisPoints: null };
  }
  if (
    patch.discountBasisPoints !== undefined &&
    patch.discountBasisPoints !== null
  ) {
    return { ...patch, fixedDiscountCents: null };
  }
  return patch;
}

// The same formula as the query: the fixed price, otherwise hourly rate x
// duration. Only needed here, to check a discount before the row changes.
function subtotalOf(pricing: {
  durationMinutes: number;
  hourlyRateCents: number;
  fixedPriceCents: number | null;
}): number {
  return (
    pricing.fixedPriceCents ??
    Math.round((pricing.hourlyRateCents * pricing.durationMinutes) / 60)
  );
}
