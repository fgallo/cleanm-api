-- True for time zone names PostgreSQL itself knows, e.g. America/Toronto.
CREATE FUNCTION is_timezone(zone text) RETURNS boolean
  LANGUAGE sql STABLE STRICT
  RETURN EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = zone);

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  name text NOT NULL,
  timezone text NOT NULL CHECK (is_timezone(timezone)),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
