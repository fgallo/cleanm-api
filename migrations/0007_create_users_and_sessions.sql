-- The people who sign in: the business owner and the admins she chooses.
-- No roles yet (project brief, section 2).
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  email text NOT NULL,
  name text NOT NULL,
  -- Self-describing: algorithm$params$salt$hash (src/auth/password.ts).
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id)
);

-- Sign-in is by email alone, so emails are unique across organizations,
-- case-insensitively.
CREATE UNIQUE INDEX users_email_key ON users (lower(email));

-- One row per signed-in browser or device. The token itself only lives in
-- the cookie; the database keeps its SHA-256, so a leaked database does not
-- give away live sessions.
CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  user_id uuid NOT NULL,
  token_hash bytea NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, user_id)
    REFERENCES users (organization_id, id) ON DELETE CASCADE
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);
