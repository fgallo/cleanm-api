import { DatabaseError } from "pg";

import { buildSetClause } from "../db/patch.ts";
import { pool } from "../db/pool.ts";
import type { JobStatus } from "../jobs/repository.ts";
import type { PaymentMethod } from "../payments/repository.ts";

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
  taxRegistrationNumber: string | null;
  taxCents: number;
  totalCents: number;
  // Derived from the payments: an invoice is paid once they cover the total
  // (project brief, design rule 3). amountDueCents goes negative when the
  // invoice was edited below what was already paid.
  paidCents: number;
  amountDueCents: number;
  paid: boolean;
  // True once someone paid the invoice in full: it has payments and they
  // cover the total. A locked invoice is no longer edited or refreshed (the
  // routes answer 409) until its payments change. An invoice with nothing to
  // pay is paid without ever being locked.
  locked: boolean;
  payments: Array<{
    id: string;
    paidOn: string; // YYYY-MM-DD
    method: PaymentMethod;
    amountCents: number;
    notes: string | null;
  }>;
  notes: string | null;
  // Who the invoice bills and who issues it, as it prints them: copied from
  // the client, the property and the organization when the invoice was
  // created, and again only when asked (refreshInvoice). Editing any of the
  // three later does not change an invoice.
  billTo: {
    name: string;
    email: string | null;
    phone: string | null;
    addressLine1: string;
    addressLine2: string | null;
    city: string;
    province: string;
    postalCode: string;
    country: string;
  };
  issuer: {
    name: string;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    province: string | null;
    postalCode: string | null;
    country: string;
    phone: string | null;
    email: string | null;
    website: string | null;
    paymentInstructions: string | null;
  };
  // The visit, its client and its property as they are now, to link to
  // them. What the invoice prints about them is in billTo.
  job: { id: string; scheduledDate: string; status: JobStatus };
  clientId: string;
  propertyId: string;
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

// What an invoice copies about who it bills and who issues it: each invoice
// column and where its value is read (c is the client, p the property, o the
// organization). One list for creating an invoice and for refreshing one, so
// the two cannot drift apart.
const billToSources = {
  bill_to_name: "c.name",
  bill_to_email: "c.email",
  bill_to_phone: "c.phone",
  bill_to_address_line1: "p.address_line1",
  bill_to_address_line2: "p.address_line2",
  bill_to_city: "p.city",
  bill_to_province: "p.province",
  bill_to_postal_code: "p.postal_code",
  bill_to_country: "p.country",
};

const issuerSources = {
  issuer_name: "o.name",
  issuer_address_line1: "o.address_line1",
  issuer_address_line2: "o.address_line2",
  issuer_city: "o.city",
  issuer_province: "o.province",
  issuer_postal_code: "o.postal_code",
  issuer_country: "o.country",
  issuer_phone: "o.phone",
  issuer_email: "o.email",
  issuer_website: "o.website",
  issuer_payment_instructions: "o.payment_instructions",
};

type Sources = Record<string, string>;

// "c.name AS bill_to_name, ...": the copied values under the invoice's names.
const selectAs = (sources: Sources) =>
  Object.entries(sources)
    .map(([column, source]) => `${source} AS ${column}`)
    .join(", ");

// "bill_to_name, ...", optionally read from a table: "job.bill_to_name, ...".
const names = (sources: Sources, prefix = "") =>
  Object.keys(sources)
    .map((column) => `${prefix}${column}`)
    .join(", ");

// "bill_to_name = c.name, ...", for an UPDATE.
const assignments = (sources: Sources) =>
  Object.entries(sources)
    .map(([column, source]) => `${column} = ${source}`)
    .join(", ");

// Every read joins the job and its property, for the state of the visit and
// the ids to link to. Who the invoice bills and who issues it come from the
// invoice's own columns.
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
  i.tax_registration_number AS "taxRegistrationNumber",
  amounts.tax_cents AS "taxCents",
  total.total_cents AS "totalCents",
  paid.paid_cents AS "paidCents",
  total.total_cents - paid.paid_cents AS "amountDueCents",
  paid.paid_cents >= total.total_cents AS paid,
  (paid.paid_cents > 0 AND paid.paid_cents >= total.total_cents) AS locked,
  paid.payments,
  i.notes,
  json_build_object(
    'name', i.bill_to_name,
    'email', i.bill_to_email,
    'phone', i.bill_to_phone,
    'addressLine1', i.bill_to_address_line1,
    'addressLine2', i.bill_to_address_line2,
    'city', i.bill_to_city,
    'province', i.bill_to_province,
    'postalCode', i.bill_to_postal_code,
    'country', i.bill_to_country
  ) AS "billTo",
  json_build_object(
    'name', i.issuer_name,
    'addressLine1', i.issuer_address_line1,
    'addressLine2', i.issuer_address_line2,
    'city', i.issuer_city,
    'province', i.issuer_province,
    'postalCode', i.issuer_postal_code,
    'country', i.issuer_country,
    'phone', i.issuer_phone,
    'email', i.issuer_email,
    'website', i.issuer_website,
    'paymentInstructions', i.issuer_payment_instructions
  ) AS issuer,
  json_build_object(
    'id', j.id,
    'scheduledDate', j.scheduled_date,
    'status', j.status
  ) AS job,
  p.client_id AS "clientId",
  p.id AS "propertyId",
  i.created_at AS "createdAt",
  i.updated_at AS "updatedAt"
`;

// The amounts are derived from the invoice's own columns, never stored, so
// editing the inputs cannot leave a stale total behind. One step per amount
// because each one is computed on the rounded result of the previous: the
// discount on the subtotal, the tax on the discounted subtotal. Exported so
// the revenue query adds up exactly what the invoice shows; `i` must be the
// invoices alias.
export const amountJoins = `
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
  CROSS JOIN LATERAL (
    SELECT amounts.subtotal_cents - amounts.discount_cents + amounts.tax_cents
      AS total_cents
  ) total
  CROSS JOIN LATERAL (
    SELECT
      COALESCE(sum(py.amount_cents), 0)::integer AS paid_cents,
      COALESCE(
        json_agg(
          json_build_object(
            'id', py.id,
            'paidOn', py.paid_on,
            'method', py.method,
            'amountCents', py.amount_cents,
            'notes', py.notes
          )
          ORDER BY py.paid_on, py.created_at
        ),
        '[]'
      ) AS payments
    FROM payments py
    WHERE py.organization_id = i.organization_id AND py.invoice_id = i.id
  ) paid
`;

const joins = `
  JOIN jobs j
    ON j.organization_id = i.organization_id AND j.id = i.job_id
  JOIN properties p
    ON p.organization_id = j.organization_id AND p.id = j.property_id
  ${amountJoins}
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

// One statement takes the next number, records it as the last one issued
// (it stays used even if this invoice is deleted), copies what the invoice
// keeps (the
// job's pricing, its client and property as billTo, the organization's tax
// and details as issuer), and inserts the invoice. The number is only taken
// when the job CTE finds an invoiceable job (the UPDATE joins it), so a
// request that fails consumes nothing. Returns undefined when the job does
// not exist, cannot be invoiced, or was invoiced by a concurrent request: the
// route checks the job first for precise errors, and the unique constraint
// is the guarantee.
export async function createInvoice(
  organizationId: string,
  input: NewInvoice,
): Promise<Invoice | undefined> {
  try {
    const { rows } = await pool.query<Invoice>(
      `WITH job AS (
         SELECT j.id, j.organization_id, j.scheduled_date,
                j.duration_minutes, j.hourly_rate_cents, j.fixed_price_cents,
                ${selectAs(billToSources)}
         FROM jobs j
         JOIN properties p
           ON p.organization_id = j.organization_id AND p.id = j.property_id
         JOIN clients c
           ON c.organization_id = p.organization_id AND c.id = p.client_id
         WHERE j.organization_id = $1 AND j.id = $2
           AND j.status IN ('scheduled', 'completed')
       ),
       numbered AS (
         UPDATE organizations o
         SET next_invoice_number = o.next_invoice_number + 1,
             last_invoice_number = o.next_invoice_number
         FROM job
         WHERE o.id = job.organization_id
         RETURNING o.next_invoice_number - 1 AS number, o.tax_name,
                   o.tax_rate_basis_points, o.tax_registration_number,
                   ${selectAs(issuerSources)}
       ),
       inserted AS (
         INSERT INTO invoices (
           organization_id, job_id, number, issue_date, due_date,
           description, service_date, duration_minutes, hourly_rate_cents,
           fixed_price_cents, fixed_discount_cents, discount_basis_points,
           discount_description, tax_name, tax_rate_basis_points,
           tax_registration_number, notes,
           ${names(billToSources)},
           ${names(issuerSources)}
         )
         SELECT job.organization_id, job.id, numbered.number, $3, $4, $5,
                job.scheduled_date, job.duration_minutes,
                job.hourly_rate_cents, job.fixed_price_cents, $6, $7, $8,
                numbered.tax_name, numbered.tax_rate_basis_points,
                numbered.tax_registration_number, $9,
                ${names(billToSources, "job.")},
                ${names(issuerSources, "numbered.")}
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

// Copies the client's, the property's and the organization's details into
// the invoice again, as they are now: for an invoice issued with something
// wrong or missing in them. The tax, registration number included, stays as
// it was when the invoice was created.
export async function refreshInvoice(
  organizationId: string,
  id: string,
): Promise<Invoice | undefined> {
  const { rows } = await pool.query<Invoice>(
    `WITH updated AS (
       UPDATE invoices i
       SET ${assignments(billToSources)},
           ${assignments(issuerSources)},
           updated_at = now()
       FROM jobs j
       JOIN properties p
         ON p.organization_id = j.organization_id AND p.id = j.property_id
       JOIN clients c
         ON c.organization_id = p.organization_id AND c.id = p.client_id
       JOIN organizations o ON o.id = j.organization_id
       WHERE i.organization_id = $1 AND i.id = $2
         AND j.organization_id = i.organization_id AND j.id = i.job_id
       RETURNING i.*
     )
     SELECT ${columns} FROM updated i ${joins}`,
    [organizationId, id],
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
