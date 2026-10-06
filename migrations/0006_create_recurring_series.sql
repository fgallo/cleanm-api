-- A rule plus the template of the jobs it generates. Jobs are materialized
-- ahead of time (see src/recurring-series/service.ts) and are then edited on
-- their own.
CREATE TABLE recurring_series (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  property_id uuid NOT NULL,
  helper_id uuid,
  -- Exactly one rule: every N weeks on the weekday of start_date, or on a
  -- day of every month (clamped to the last day of shorter months).
  every_weeks integer CHECK (every_weeks > 0),
  day_of_month integer CHECK (day_of_month BETWEEN 1 AND 31),
  start_date date NOT NULL,
  -- Last possible visit; null means the series has no end.
  end_date date CHECK (end_date >= start_date),
  -- Jobs exist up to this date. The next generation starts after it, so
  -- generating twice never duplicates a visit.
  generated_until date,
  -- Template copied into each generated job.
  start_time time NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  service_type text NOT NULL
    CHECK (service_type IN ('regular', 'deep', 'move_in', 'move_out')),
  hourly_rate_cents integer NOT NULL CHECK (hourly_rate_cents >= 0),
  fixed_price_cents integer CHECK (fixed_price_cents >= 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(every_weeks, day_of_month) = 1),
  FOREIGN KEY (organization_id, property_id)
    REFERENCES properties (organization_id, id),
  FOREIGN KEY (organization_id, helper_id)
    REFERENCES helpers (organization_id, id),
  UNIQUE (organization_id, id)
);

CREATE INDEX recurring_series_organization_id_idx
  ON recurring_series (organization_id);

ALTER TABLE jobs
  ADD COLUMN recurring_series_id uuid,
  -- No cascade: the service removes a series' unrealized jobs itself, and
  -- refuses to delete a series once any of its jobs happened.
  ADD FOREIGN KEY (organization_id, recurring_series_id)
    REFERENCES recurring_series (organization_id, id);

CREATE INDEX jobs_organization_id_recurring_series_id_idx
  ON jobs (organization_id, recurring_series_id);
