import { Router } from "express";

import { NotFoundError, ValidationError } from "../http/errors.ts";
import * as invoices from "../invoices/repository.ts";
import * as organizations from "../organizations/repository.ts";
import * as payments from "./repository.ts";
import {
  createPaymentSchema,
  invoicePaymentsParamsSchema,
  paymentIdSchema,
  updatePaymentSchema,
} from "./schemas.ts";

// Shallow nesting: a payment is created under its invoice and addressed by
// its own id afterwards. The invoice embeds its payments, so there is no
// list route. Paths are complete, so mount without a prefix.
export const paymentsRouter = Router();

// A payment never takes an invoice past paid: a typo in the amount is more
// likely than money arriving twice. Two requests at the same time can still
// add up past the total; one owner recording payments makes that moot.
paymentsRouter.post("/invoices/:invoiceId/payments", async (req, res) => {
  const { invoiceId } = invoicePaymentsParamsSchema.parse(req.params);
  const input = createPaymentSchema.parse(req.body);
  const invoice = await invoices.findInvoice(
    res.locals.organizationId,
    invoiceId,
  );
  if (invoice === undefined) {
    throw new NotFoundError("Invoice not found");
  }
  assertWithinDue(input.amountCents, invoice.amountDueCents);

  const payment = await payments.createPayment(
    res.locals.organizationId,
    invoiceId,
    {
      ...input,
      paidOn:
        input.paidOn ?? (await organizations.today(res.locals.organizationId)),
    },
  );
  if (payment === undefined) {
    throw new NotFoundError("Invoice not found");
  }
  res.status(201).json(payment);
});

paymentsRouter.get("/payments/:id", async (req, res) => {
  const { id } = paymentIdSchema.parse(req.params);
  const payment = await payments.findPayment(res.locals.organizationId, id);
  if (payment === undefined) {
    throw new NotFoundError("Payment not found");
  }
  res.json(payment);
});

// The amount may grow by what the invoice still owes on top of this
// payment's own share.
paymentsRouter.patch("/payments/:id", async (req, res) => {
  const { id } = paymentIdSchema.parse(req.params);
  const patch = updatePaymentSchema.parse(req.body);
  const current = await payments.findPayment(res.locals.organizationId, id);
  if (current === undefined) {
    throw new NotFoundError("Payment not found");
  }
  if (patch.amountCents !== undefined) {
    const invoice = await invoices.findInvoice(
      res.locals.organizationId,
      current.invoiceId,
    );
    assertWithinDue(
      patch.amountCents,
      (invoice?.amountDueCents ?? 0) + current.amountCents,
    );
  }

  const payment = await payments.updatePayment(
    res.locals.organizationId,
    id,
    patch,
  );
  if (payment === undefined) {
    throw new NotFoundError("Payment not found");
  }
  res.json(payment);
});

paymentsRouter.delete("/payments/:id", async (req, res) => {
  const { id } = paymentIdSchema.parse(req.params);
  const deleted = await payments.deletePayment(res.locals.organizationId, id);
  if (!deleted) {
    throw new NotFoundError("Payment not found");
  }
  res.status(204).end();
});

function assertWithinDue(amountCents: number, dueCents: number): void {
  if (amountCents > dueCents) {
    throw new ValidationError([
      {
        path: "amountCents",
        message: `Must not exceed the amount due of ${Math.max(dueCents, 0)}`,
      },
    ]);
  }
}
