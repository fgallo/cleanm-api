import { buildSetClause } from "../db/patch.ts";
import { pool } from "../db/pool.ts";

export const paymentMethods = ["e_transfer", "cash"] as const;
export type PaymentMethod = (typeof paymentMethods)[number];

export type Payment = {
  id: string;
  invoiceId: string;
  paidOn: string; // YYYY-MM-DD
  method: PaymentMethod;
  amountCents: number;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type NewPayment = {
  paidOn: string;
  method: PaymentMethod;
  amountCents: number;
  notes?: string | null;
};

// Only the keys present are updated; null clears a field. A payment stays
// with its invoice.
export type PaymentPatch = Partial<NewPayment>;

const patchableColumns: Record<keyof PaymentPatch, string> = {
  paidOn: "paid_on",
  method: "method",
  amountCents: "amount_cents",
  notes: "notes",
};

const columns = `
  id,
  invoice_id AS "invoiceId",
  paid_on AS "paidOn",
  method,
  amount_cents AS "amountCents",
  notes,
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

export async function findPayment(
  organizationId: string,
  id: string,
): Promise<Payment | undefined> {
  const { rows } = await pool.query<Payment>(
    `SELECT ${columns} FROM payments WHERE organization_id = $1 AND id = $2`,
    [organizationId, id],
  );
  return rows[0];
}

// Returns undefined when the invoice does not exist in the organization:
// the SELECT finds no invoice, so nothing is inserted.
export async function createPayment(
  organizationId: string,
  invoiceId: string,
  input: NewPayment,
): Promise<Payment | undefined> {
  const { rows } = await pool.query<Payment>(
    `INSERT INTO payments (
       organization_id, invoice_id, paid_on, method, amount_cents, notes
     )
     SELECT organization_id, id, $3, $4, $5, $6
     FROM invoices
     WHERE organization_id = $1 AND id = $2
     RETURNING ${columns}`,
    [
      organizationId,
      invoiceId,
      input.paidOn,
      input.method,
      input.amountCents,
      input.notes ?? null,
    ],
  );
  return rows[0];
}

export async function updatePayment(
  organizationId: string,
  id: string,
  patch: PaymentPatch,
): Promise<Payment | undefined> {
  const set = buildSetClause(patch, patchableColumns, 3);
  if (set.values.length === 0) {
    return findPayment(organizationId, id);
  }

  const { rows } = await pool.query<Payment>(
    `UPDATE payments
     SET ${set.assignments}, updated_at = now()
     WHERE organization_id = $1 AND id = $2
     RETURNING ${columns}`,
    [organizationId, id, ...set.values],
  );
  return rows[0];
}

export async function deletePayment(
  organizationId: string,
  id: string,
): Promise<boolean> {
  const { rowCount } = await pool.query(
    "DELETE FROM payments WHERE organization_id = $1 AND id = $2",
    [organizationId, id],
  );
  return (rowCount ?? 0) > 0;
}
