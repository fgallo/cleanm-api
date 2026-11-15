-- The highest invoice number ever issued. It stays when that invoice is
-- deleted, so next_invoice_number can be corrected down to just above it and
-- never to a number that was already used (project brief, design rule 5).
-- Until now the limit was the highest number still in use: deleting the last
-- invoice let its number be given out again.
ALTER TABLE organizations
  ADD COLUMN last_invoice_number integer NOT NULL DEFAULT 0
    CHECK (last_invoice_number >= 0);

-- Which numbers were issued and deleted before this column existed is not
-- known. Where an organization has invoices, every number below the next one
-- counts as used.
UPDATE organizations o
SET last_invoice_number = o.next_invoice_number - 1
WHERE EXISTS (SELECT 1 FROM invoices i WHERE i.organization_id = o.id);

-- The guarantee, whatever the path: the next number is above every number
-- issued.
ALTER TABLE organizations
  ADD CONSTRAINT organizations_invoice_number_not_reused
    CHECK (next_invoice_number > last_invoice_number);
