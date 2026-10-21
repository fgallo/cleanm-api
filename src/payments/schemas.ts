import { z } from "zod";

import { paymentMethods } from "./repository.ts";

const paymentFields = {
  // Defaults to today on the organization's calendar.
  paidOn: z.iso.date(),
  method: z.enum(paymentMethods),
  // Not above what the invoice still owes: the route checks that against
  // the invoice.
  amountCents: z.int().positive(),
  notes: z.string().trim().min(1).max(2000).nullable(),
};

export const createPaymentSchema = z.object({
  ...paymentFields,
  paidOn: paymentFields.paidOn.optional(),
  notes: paymentFields.notes.optional(),
});

export const updatePaymentSchema = z
  .object(paymentFields)
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "At least one field is required",
  });

export const paymentIdSchema = z.object({ id: z.uuid() });

export const invoicePaymentsParamsSchema = z.object({ invoiceId: z.uuid() });
