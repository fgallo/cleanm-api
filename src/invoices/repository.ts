import { DatabaseError } from "pg";

import { buildSetClause } from "../db/patch.ts";
import { pool } from "../db/pool.ts";
import type { JobStatus } from "../jobs/repository.ts";

export type Invoice = {
  id: string;
  // Sequential per organization.
  number: number;
  issueDate: string; // YYYY-MM-DD
  // Null means due on receipt.
  dueDate: string | null;
  description: string;
  serviceDate: string; // YYYY-MM-DD
  // Copied from the job when the invoice was created, edited on the invoice
  // since. When fixedPriceCents is null, the subtotal is hourly rate x
  // duration.
  durationMinutes: number;
  hourlyRateCents: number;
  fixedPriceCents: number | null;
  subtotalCents: number;
  // A discount as an amount or as a share of the subtotal (1000 means 10%),
  // at most one of the two; discountCents is the amount taken off.
  fixedDiscountCents: number | null;
  discountBasisPoints: number | null;
  discountCents: number;
  // Printed next to the discount, e.g. "Referral for 1 cleaning".
  discountDescription: string | null;
  // Copied from the organization when the invoice was created. The tax
  // applies to the discounted subtotal.
  taxName: string | null;
  taxRateBasisPoints: number;
  taxCents: number;
  totalCents: number;
  notes: string | null;
  job: { id: string; scheduledDate: string; status: JobStatus };
  client: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  };
  property: {
    id: string;
    addressLine1: string;
    addressLine2: string | null;
    city: string;
    province: string;
    postalCode: string;
    country: string;
  };
  createdAt: Date;
  updatedAt: Date;
};

export type NewInvoice = {
  jobId: string;
  issueDate: string;
  dueDate?: string | null;
  description: string;
  fixedDiscountCents?: number | null;
  discountBasisPoints?: number | null;
  discountDescription?: string | null;
  notes?: string | null;
};

// Only the keys present are updated; null clears a field. The tax is not
// patchable: it is the organization's setting at the time of creation.
export type InvoicePatch = Partial<{
  issueDate: string;
  dueDate: string | null;
  serviceDate: string;
  description: string;
  durationMinutes: number;
  hourlyRateCents: number;
  fixedPriceCents: number | null;
  fixedDiscountCents: number | null;
  discountBasisPoints: number | null;
  discountDescription: string | null;
  notes: string | null;
}>;

const patchableColumns: Record<keyof InvoicePatch, string> = {
  issueDate: "issue_date",
  dueDate: "due_date",
  serviceDate: "service_date",
  description: "description",
  durationMinutes: "duration_minutes",
  hourlyRateCents: "hourly_rate_cents",
  fixedPriceCents: "fixed_price_cents",
  fixedDiscountCents: "fixed_discount_cents",
  discountBasisPoints: "discount_basis_points",
  discountDescription: "discount_description",
  notes: "notes",
};

// Every read joins the job, its property and its client: the invoice prints
// them, and the invoices list shows the client with each row.
const columns = `
  i.id,
  i.number,
  i.issue_date AS "issueDate",
  i.due_date AS "dueDate",
  i.description,
  i.service_date AS "serviceDate",
  i.duration_minutes AS "durationMinutes",
  i.hourly_rate_cents AS "hourlyRateCents",
  i.fixed_price_cents AS "fixedPriceCents",
  amounts.subtotal_cents AS "subtotalCents",
  i.fixed_discount_cents AS "fixedDiscountCents",
  i.discount_basis_points AS "discountBasisPoints",
  amounts.discount_cents AS "discountCents",
  i.discount_description AS "discountDescription",
  i.tax_name AS "taxName",
  i.tax_rate_basis_points AS "taxRateBasisPoints",
  amounts.tax_cents AS "taxCents",
  amounts.subtotal_cents - amounts.discount_cents + amounts.tax_cents
    AS "totalCents",
  i.notes,
  json_build_object(
    'id', j.id,
    'scheduledDate', j.scheduled_date,
    'status', j.status
  ) AS job,
  json_build_object(
    'id', c.id,
    'name', c.name,
    'email', c.email,
    'phone', c.phone
  ) AS client,
  json_build_object(
    'id', p.id,
    'addressLine1', p.address_line1,
    'addressLine2', p.address_line2,
    'city', p.city,
    'province', p.province,
    'postalCode', p.postal_code,
    'country', p.country
  ) AS property,
  i.created_at AS "createdAt",
  i.updated_at AS "updatedAt"
`;

// The amounts are derived from the invoice's own columns, never stored, so
// editing the inputs cannot leave a stale total behind. One step per amount
// because each one is computed on the rounded result of the previous: the
// discount on the subtotal, the tax on the discounted subtotal.
const joins = `
  JOIN jobs j
    ON j.organization_id = i.organization_id AND j.id = i.job_id
  JOIN properties p
    ON p.organization_id = j.organization_id AND p.id = j.property_id
  JOIN clients c
    ON c.organization_id = p.organization_id AND c.id = p.client_id
  CROSS JOIN LATERAL (
    SELECT COALESCE(
      i.fixed_price_cents,
      round(i.hourly_rate_cents * i.duration_minutes / 60.0)::integer
    ) AS subtotal_cents
  ) subtotal
  CROSS JOIN LATERAL (
    SELECT COALESCE(
      i.fixed_discount_cents,
      round(subtotal.subtotal_cents * i.discount_basis_points / 10000.0)::integer,
      0
    ) AS discount_cents
  ) discount
  CROSS JOIN LATERAL (
    SELECT
      subtotal.subtotal_cents,
      discount.discount_cents,
      round(
        (subtotal.subtotal_cents - discount.discount_cents)
        * i.tax_rate_basis_points / 10000.0
      )::integer AS tax_cents
  ) amounts
`;

export async function listInvoices(
  organizationId: string,
  range: { from: string; to: string },
): Promise<Invoice[]> {
  const { rows } = await pool.query<Invoice>(
    `SELECT ${columns} FROM invoices i ${joins}
     WHERE i.organization_id = $1 AND i.issue_date BETWEEN $2 AND $3
     ORDER BY i.issue_date DESC, i.number DESC`,
    [organizationId, range.from, range.to],
  );
  return rows;
}

export async function findInvoice(
  organizationId: string,
  id: string,
): Promise<Invoice | undefined> {
  const { rows } = await pool.query<Invoice>(
    `SELECT ${columns} FROM invoices i ${joins}
     WHERE i.organization_id = $1 AND i.id = $2`,
    [organizationId, id],
  );
  return rows[0];
}

// One statement takes the next number, copies the job and the organization's
// tax, and inserts the invoice. The number is only taken when the job CTE
// finds an invoiceable job (the UPDATE joins it), so a request that fails
// consumes nothing. Returns undefined when the job does not exist, cannot be
// invoiced, or was invoiced by a concurrent request: the route checks the job
// first for precise errors, and the unique constraint is the guarantee.
export async function createInvoice(
  organizationId: string,
  input: NewInvoice,
): Promise<Invoice | undefined> {
  try {
    const { rows } = await pool.query<Invoice>(
      `WITH job AS (
         SELECT id, organization_id, scheduled_date, duration_minutes,
                hourly_rate_cents, fixed_price_cents
         FROM jobs
         WHERE organization_id = $1 AND id = $2
           AND status IN ('scheduled', 'completed')
       ),
       numbered AS (
         UPDATE organizations o
         SET next_invoice_number = o.next_invoice_number + 1
         FROM job
         WHERE o.id = job.organization_id
         RETURNING o.next_invoice_number - 1 AS number, o.tax_name,
                   o.tax_rate_basis_points
       ),
       inserted AS (
         INSERT INTO invoices (
           organization_id, job_id, number, issue_date, due_date,
           description, service_date, duration_minutes, hourly_rate_cents,
           fixed_price_cents, fixed_discount_cents, discount_basis_points,
           discount_description, tax_name, tax_rate_basis_points, notes
         )
         SELECT job.organization_id, job.id, numbered.number, $3, $4, $5,
                job.scheduled_date, job.duration_minutes,
                job.hourly_rate_cents, job.fixed_price_cents, $6, $7, $8,
                numbered.tax_name, numbered.tax_rate_basis_points, $9
         FROM job, numbered
         RETURNING *
       )
       SELECT ${columns} FROM inserted i ${joins}`,
      [
        organizationId,
        input.jobId,
        input.issueDate,
        input.dueDate ?? null,
        input.description,
        input.fixedDiscountCents ?? null,
        input.discountBasisPoints ?? null,
        input.discountDescription ?? null,
        input.notes ?? null,
      ],
    );
    return rows[0];
  } catch (error) {
    if (
      error instanceof DatabaseError &&
      error.constraint === "invoices_organization_id_job_id_key"
    ) {
      return undefined;
    }
    throw error;
  }
}

export async function updateInvoice(
  organizationId: string,
  id: string,
  patch: InvoicePatch,
): Promise<Invoice | undefined> {
  const set = buildSetClause(patch, patchableColumns, 3);
  if (set.values.length === 0) {
    return findInvoice(organizationId, id);
  }

  const { rows } = await pool.query<Invoice>(
    `WITH updated AS (
       UPDATE invoices
       SET ${set.assignments}, updated_at = now()
       WHERE organization_id = $1 AND id = $2
       RETURNING *
     )
     SELECT ${columns} FROM updated i ${joins}`,
    [organizationId, id, ...set.values],
  );
  return rows[0];
}

export async function deleteInvoice(
  organizationId: string,
  id: string,
): Promise<boolean> {
  const { rowCount } = await pool.query(
    "DELETE FROM invoices WHERE organization_id = $1 AND id = $2",
    [organizationId, id],
  );
  return (rowCount ?? 0) > 0;
}
