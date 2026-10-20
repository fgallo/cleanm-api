-- Money received for an invoice. Several partial payments may cover one
-- invoice; "paid" is derived from their sum against the total (project
-- brief, design rule 3), never stored.
CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  invoice_id uuid NOT NULL,
  -- The day the money arrived, on the organization's calendar: revenue is
  -- looked up by month.
  paid_on date NOT NULL,
  method text NOT NULL CHECK (method IN ('e_transfer', 'cash')),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- No cascade: an invoice with payments cannot be deleted, so history is
  -- kept.
  FOREIGN KEY (organization_id, invoice_id)
    REFERENCES invoices (organization_id, id)
);

CREATE INDEX payments_organization_id_invoice_id_idx
  ON payments (organization_id, invoice_id);

-- Revenue by the month the money came in.
CREATE INDEX payments_organization_id_paid_on_idx
  ON payments (organization_id, paid_on);
