-- The people who do the cleaning with the business owner. A job may be
-- assigned to one of them.
CREATE TABLE helpers (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  name text NOT NULL,
  phone text,
  -- A helper with jobs in the history cannot be deleted; one who left the
  -- business is deactivated instead, so new jobs do not offer them.
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id)
);

CREATE INDEX helpers_organization_id_idx ON helpers (organization_id);

ALTER TABLE jobs
  ADD COLUMN helper_id uuid,
  -- No cascade: history is kept (see the properties foreign key).
  ADD FOREIGN KEY (organization_id, helper_id)
    REFERENCES helpers (organization_id, id);

CREATE INDEX jobs_organization_id_helper_id_idx
  ON jobs (organization_id, helper_id);
