-- Lets other tables reference a client together with its organization,
-- so a row can never point at a client of another organization.
ALTER TABLE clients
  ADD CONSTRAINT clients_organization_id_id_key UNIQUE (organization_id, id);

-- Where a job happens. One client can have more than one property.
CREATE TABLE properties (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  client_id uuid NOT NULL,
  address_line1 text NOT NULL,
  address_line2 text,
  city text NOT NULL,
  province text NOT NULL,
  postal_code text NOT NULL,
  country text NOT NULL DEFAULT 'CA',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, client_id)
    REFERENCES clients (organization_id, id) ON DELETE CASCADE
);

CREATE INDEX properties_organization_id_client_id_idx
  ON properties (organization_id, client_id);
