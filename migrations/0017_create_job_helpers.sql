-- A visit is done by any number of helpers, each paid their usual rate
-- unless this visit pays them another. These tables replace the single
-- helper a job and a series had (helper_id and helper_hourly_rate_cents on
-- both).
CREATE TABLE job_helpers (
  organization_id uuid NOT NULL REFERENCES organizations (id),
  job_id uuid NOT NULL,
  helper_id uuid NOT NULL,
  -- What this helper is paid for an hour of this job when it is not their
  -- usual rate; null means the usual rate (helpers.hourly_rate_cents).
  hourly_rate_cents integer CHECK (hourly_rate_cents >= 0),
  PRIMARY KEY (job_id, helper_id),
  -- Who does a job is part of the job, and goes with it.
  FOREIGN KEY (organization_id, job_id)
    REFERENCES jobs (organization_id, id) ON DELETE CASCADE,
  -- No cascade: a helper with jobs cannot be deleted, so history is kept.
  FOREIGN KEY (organization_id, helper_id)
    REFERENCES helpers (organization_id, id)
);

CREATE INDEX job_helpers_organization_id_helper_id_idx
  ON job_helpers (organization_id, helper_id);

-- The helpers the jobs of a series are generated with.
CREATE TABLE recurring_series_helpers (
  organization_id uuid NOT NULL REFERENCES organizations (id),
  recurring_series_id uuid NOT NULL,
  helper_id uuid NOT NULL,
  hourly_rate_cents integer CHECK (hourly_rate_cents >= 0),
  PRIMARY KEY (recurring_series_id, helper_id),
  FOREIGN KEY (organization_id, recurring_series_id)
    REFERENCES recurring_series (organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, helper_id)
    REFERENCES helpers (organization_id, id)
);

CREATE INDEX recurring_series_helpers_organization_id_helper_id_idx
  ON recurring_series_helpers (organization_id, helper_id);

-- The helper each job and each series had, with the rate it paid them. A
-- rate left on a job that no longer had a helper is not carried over: a rate
-- is now what one helper is paid for one job.
INSERT INTO job_helpers (organization_id, job_id, helper_id, hourly_rate_cents)
SELECT organization_id, id, helper_id, helper_hourly_rate_cents
FROM jobs
WHERE helper_id IS NOT NULL;

INSERT INTO recurring_series_helpers (
  organization_id, recurring_series_id, helper_id, hourly_rate_cents
)
SELECT organization_id, id, helper_id, helper_hourly_rate_cents
FROM recurring_series
WHERE helper_id IS NOT NULL;

ALTER TABLE jobs
  DROP COLUMN helper_id,
  DROP COLUMN helper_hourly_rate_cents;

ALTER TABLE recurring_series
  DROP COLUMN helper_id,
  DROP COLUMN helper_hourly_rate_cents;
