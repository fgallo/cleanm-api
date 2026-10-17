import { z } from "zod";

const cents = z.int().min(0);
const text = (max: number) => z.string().trim().min(1).max(max);

// What the owner edits on an invoice. The tax is not here: it is copied from
// the organization when the invoice is created.
const invoiceFields = {
  issueDate: z.iso.date(),
  // null means due on receipt. Not before issueDate: the route checks that,
  // because in a PATCH either date may be the stored one.
  dueDate: z.iso.date().nullable(),
  serviceDate: z.iso.date(),
  description: text(500),
  durationMinutes: z
    .int()
    .positive()
    .max(24 * 60),
  hourlyRateCents: cents,
  // null means the subtotal is hourly rate x duration.
  fixedPriceCents: cents.nullable(),
  // A discount as an amount or as a share of the subtotal (1000 means 10%),
  // not both. A fixed discount must not exceed the subtotal: the route
  // checks that, because the subtotal may be the stored one.
  fixedDiscountCents: cents.nullable(),
  discountBasisPoints: z.int().min(0).max(10000).nullable(),
  // Printed next to the discount, e.g. "Referral for 1 cleaning".
  discountDescription: text(200).nullable(),
  notes: text(2000).nullable(),
};

type Discount = {
  fixedDiscountCents?: number | null;
  discountBasisPoints?: number | null;
};

const hasOneDiscountForm = (input: Discount) =>
  input.fixedDiscountCents === undefined ||
  input.fixedDiscountCents === null ||
  input.discountBasisPoints === undefined ||
  input.discountBasisPoints === null;

const oneDiscountFormIssue = {
  message: "Use either fixedDiscountCents or discountBasisPoints",
  path: ["discountBasisPoints"],
};

// The pricing comes from the job; the dates, the line, the discount and the
// notes can be given up front. issueDate defaults to today on the
// organization's calendar, description to the kind of cleaning.
export const createInvoiceSchema = z
  .object({
    jobId: z.uuid(),
    issueDate: invoiceFields.issueDate.optional(),
    dueDate: invoiceFields.dueDate.optional(),
    description: invoiceFields.description.optional(),
    fixedDiscountCents: invoiceFields.fixedDiscountCents.optional(),
    discountBasisPoints: invoiceFields.discountBasisPoints.optional(),
    discountDescription: invoiceFields.discountDescription.optional(),
    notes: invoiceFields.notes.optional(),
  })
  .refine(hasOneDiscountForm, oneDiscountFormIssue);

export const updateInvoiceSchema = z
  .object(invoiceFields)
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "At least one field is required",
  })
  .refine(hasOneDiscountForm, oneDiscountFormIssue);

export const invoiceIdSchema = z.object({ id: z.uuid() });

// Both dates are inclusive and apply to issueDate.
export const listInvoicesQuerySchema = z
  .object({ from: z.iso.date(), to: z.iso.date() })
  .refine((range) => range.from <= range.to, {
    message: "Must not be before from",
    path: ["to"],
  });
