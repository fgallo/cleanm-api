-- What an invoice prints about who it bills and who issues it. These were
-- read from the client, the property and the organization whenever the
-- invoice was shown, so editing any of them changed invoices already issued.
-- The invoice now takes its own copy when it is created, as it already does
-- with the pricing and the tax (project brief, design rules 5 and 7).
ALTER TABLE invoices
  -- Goes with tax_name and tax_rate_basis_points: an invoice issued before
  -- the business registered does not gain a registration number afterwards.
  ADD COLUMN tax_registration_number text,
  ADD COLUMN bill_to_name text,
  ADD COLUMN bill_to_email text,
  ADD COLUMN bill_to_phone text,
  ADD COLUMN bill_to_address_line1 text,
  ADD COLUMN bill_to_address_line2 text,
  ADD COLUMN bill_to_city text,
  ADD COLUMN bill_to_province text,
  ADD COLUMN bill_to_postal_code text,
  ADD COLUMN bill_to_country text,
  ADD COLUMN issuer_name text,
  ADD COLUMN issuer_address_line1 text,
  ADD COLUMN issuer_address_line2 text,
  ADD COLUMN issuer_city text,
  ADD COLUMN issuer_province text,
  ADD COLUMN issuer_postal_code text,
  ADD COLUMN issuer_country text,
  ADD COLUMN issuer_phone text,
  ADD COLUMN issuer_email text,
  ADD COLUMN issuer_website text,
  ADD COLUMN issuer_payment_instructions text;

-- The invoices that already exist get today's values: what they showed
-- before cannot be recovered. The registration number only where the invoice
-- charged a tax, so one issued without tax stays without a number.
UPDATE invoices i
SET
  tax_registration_number = CASE
    WHEN i.tax_rate_basis_points > 0 THEN o.tax_registration_number
  END,
  bill_to_name = c.name,
  bill_to_email = c.email,
  bill_to_phone = c.phone,
  bill_to_address_line1 = p.address_line1,
  bill_to_address_line2 = p.address_line2,
  bill_to_city = p.city,
  bill_to_province = p.province,
  bill_to_postal_code = p.postal_code,
  bill_to_country = p.country,
  issuer_name = o.name,
  issuer_address_line1 = o.address_line1,
  issuer_address_line2 = o.address_line2,
  issuer_city = o.city,
  issuer_province = o.province,
  issuer_postal_code = o.postal_code,
  issuer_country = o.country,
  issuer_phone = o.phone,
  issuer_email = o.email,
  issuer_website = o.website,
  issuer_payment_instructions = o.payment_instructions
FROM jobs j
JOIN properties p
  ON p.organization_id = j.organization_id AND p.id = j.property_id
JOIN clients c
  ON c.organization_id = p.organization_id AND c.id = p.client_id
JOIN organizations o ON o.id = j.organization_id
WHERE j.organization_id = i.organization_id AND j.id = i.job_id;

-- The same columns that are required where they are copied from.
ALTER TABLE invoices
  ALTER COLUMN bill_to_name SET NOT NULL,
  ALTER COLUMN bill_to_address_line1 SET NOT NULL,
  ALTER COLUMN bill_to_city SET NOT NULL,
  ALTER COLUMN bill_to_province SET NOT NULL,
  ALTER COLUMN bill_to_postal_code SET NOT NULL,
  ALTER COLUMN bill_to_country SET NOT NULL,
  ALTER COLUMN issuer_name SET NOT NULL,
  ALTER COLUMN issuer_country SET NOT NULL;
