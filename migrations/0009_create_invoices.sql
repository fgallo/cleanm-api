-- Lets other tables reference a job together with its organization.
ALTER TABLE jobs
  ADD CONSTRAINT jobs_organization_id_id_key UNIQUE (organization_id, id);

-- One invoice per visit. When it is created, the invoice copies the pricing
-- inputs of the job and the tax of the organization, and keeps its own copy
-- from then on: the owner edits the invoice itself, and a later change to the
-- job or to the tax settings never changes it. The amounts (subtotal, tax,
-- total) are derived from these columns in the query, as a job's price is.
CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  job_id uuid NOT NULL,
  -- Sequential per organization, taken from organizations.next_invoice_number
  -- when the invoice is created. A deleted invoice leaves a gap: numbers are
  -- never reused.
  number integer NOT NULL CHECK (number > 0),
  issue_date date NOT NULL,
  -- Null means due on receipt.
  due_date date CHECK (due_date >= issue_date),
  -- The line printed on the invoice, free text.
  description text NOT NULL,
  service_date date NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  hourly_rate_cents integer NOT NULL CHECK (hourly_rate_cents >= 0),
  -- Set when a price was agreed instead of hourly rate x duration.
  fixed_price_cents integer CHECK (fixed_price_cents >= 0),
  -- A discount, as an amount or as a share of the subtotal (1000 means
  -- 10.00%), at most one of the two. The tax applies to the discounted
  -- amount.
  fixed_discount_cents integer CHECK (fixed_discount_cents >= 0),
  discount_basis_points integer
    CHECK (discount_basis_points BETWEEN 0 AND 10000),
  -- Printed next to the discount, e.g. "Referral for 1 cleaning".
  discount_description text,
  tax_name text,
  -- 1300 means 13.00%.
  tax_rate_basis_points integer NOT NULL
    CHECK (tax_rate_basis_points BETWEEN 0 AND 10000),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(fixed_discount_cents, discount_basis_points) <= 1),
  -- A fixed discount never exceeds the subtotal (the route answers 400
  -- first; this keeps the total from going negative whatever the path).
  CHECK (
    fixed_discount_cents IS NULL
    OR fixed_discount_cents <= COALESCE(
      fixed_price_cents,
      round(hourly_rate_cents * duration_minutes / 60.0)
    )
  ),
  -- No cascade: a job with an invoice cannot be deleted, so history is kept.
  FOREIGN KEY (organization_id, job_id) REFERENCES jobs (organization_id, id),
  -- The repository relies on this name to answer "already invoiced" when two
  -- requests invoice the same job at once.
  CONSTRAINT invoices_organization_id_job_id_key UNIQUE (organization_id, job_id),
  UNIQUE (organization_id, number),
  -- Lets payments reference an invoice together with its organization.
  UNIQUE (organization_id, id)
);

-- The invoices screen lists by issue date range.
CREATE INDEX invoices_organization_id_issue_date_idx
  ON invoices (organization_id, issue_date);
