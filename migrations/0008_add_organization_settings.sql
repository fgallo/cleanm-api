-- What an invoice prints about the business, how it is paid, and the tax it
-- charges (project brief, design rule 5). Null tax registration with a zero
-- rate is a business that is not registered.
ALTER TABLE organizations
  ADD COLUMN address_line1 text,
  ADD COLUMN address_line2 text,
  ADD COLUMN city text,
  ADD COLUMN province text,
  ADD COLUMN postal_code text,
  ADD COLUMN country text NOT NULL DEFAULT 'CA',
  ADD COLUMN phone text,
  ADD COLUMN email text,
  -- Free text printed on invoices, e.g. "Interac e-Transfer: ana@example.com".
  ADD COLUMN payment_instructions text,
  ADD COLUMN tax_name text,
  -- 1300 means 13.00%.
  ADD COLUMN tax_rate_basis_points integer NOT NULL DEFAULT 0
    CHECK (tax_rate_basis_points BETWEEN 0 AND 10000),
  ADD COLUMN tax_registration_number text,
  -- Invoice numbers are sequential per organization; this is the next one.
  ADD COLUMN next_invoice_number integer NOT NULL DEFAULT 1
    CHECK (next_invoice_number > 0);
