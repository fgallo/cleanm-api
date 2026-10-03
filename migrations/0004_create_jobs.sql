-- Lets other tables reference a property together with its organization.
ALTER TABLE properties
  ADD CONSTRAINT properties_organization_id_id_key UNIQUE (organization_id, id);

-- A visit to a property. One-off jobs only for now: recurring series, helpers
-- and invoices get their columns in later migrations.
CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  property_id uuid NOT NULL,
  -- A job is a day and a time on the organization's calendar, not an instant,
  -- so neither column carries a time zone.
  scheduled_date date NOT NULL,
  start_time time NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  service_type text NOT NULL
    CHECK (service_type IN ('regular', 'deep', 'move_in', 'move_out')),
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('estimated', 'scheduled', 'completed', 'cancelled')),
  hourly_rate_cents integer NOT NULL CHECK (hourly_rate_cents >= 0),
  -- Set when a price was agreed instead of hourly rate x duration.
  fixed_price_cents integer CHECK (fixed_price_cents >= 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- No cascade: a property with jobs cannot be deleted, so history is kept.
  FOREIGN KEY (organization_id, property_id)
    REFERENCES properties (organization_id, id)
);

-- The calendar lists jobs by date range.
CREATE INDEX jobs_organization_id_scheduled_date_idx
  ON jobs (organization_id, scheduled_date);

CREATE INDEX jobs_organization_id_property_id_idx
  ON jobs (organization_id, property_id);
