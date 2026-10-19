-- The logo printed on invoices. It lives in the database: one small image per
-- organization travels with the backup and needs no file host, which the
-- deploy target may not offer.
ALTER TABLE organizations
  ADD COLUMN logo bytea,
  ADD COLUMN logo_content_type text
    CHECK (logo_content_type IN ('image/png', 'image/jpeg')),
  ADD CHECK (num_nonnulls(logo, logo_content_type) IN (0, 2));
