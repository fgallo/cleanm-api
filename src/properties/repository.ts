import { buildSetClause } from "../db/patch.ts";
import { pool } from "../db/pool.ts";

export type Property = {
  id: string;
  clientId: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type NewProperty = {
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  province: string;
  postalCode: string;
  country?: string;
  notes?: string | null;
};

// Only the keys present are updated; null clears a field.
// A property does not move to another client, so clientId is not patchable.
export type PropertyPatch = Partial<NewProperty>;

const patchableColumns: Record<keyof PropertyPatch, string> = {
  addressLine1: "address_line1",
  addressLine2: "address_line2",
  city: "city",
  province: "province",
  postalCode: "postal_code",
  country: "country",
  notes: "notes",
};

const columns = `
  id,
  client_id AS "clientId",
  address_line1 AS "addressLine1",
  address_line2 AS "addressLine2",
  city,
  province,
  postal_code AS "postalCode",
  country,
  notes,
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

export async function listProperties(
  organizationId: string,
  clientId: string,
): Promise<Property[]> {
  const { rows } = await pool.query<Property>(
    `SELECT ${columns} FROM properties
     WHERE organization_id = $1 AND client_id = $2
     ORDER BY created_at, id`,
    [organizationId, clientId],
  );
  return rows;
}

export async function findProperty(
  organizationId: string,
  id: string,
): Promise<Property | undefined> {
  const { rows } = await pool.query<Property>(
    `SELECT ${columns} FROM properties WHERE organization_id = $1 AND id = $2`,
    [organizationId, id],
  );
  return rows[0];
}

// Returns undefined when the client does not exist in the organization: the
// SELECT finds no client, so nothing is inserted. An INSERT ... SELECT cannot
// use the DEFAULT keyword, hence the COALESCE mirroring the column default.
export async function createProperty(
  organizationId: string,
  clientId: string,
  input: NewProperty,
): Promise<Property | undefined> {
  const { rows } = await pool.query<Property>(
    `INSERT INTO properties (
       organization_id, client_id, address_line1, address_line2,
       city, province, postal_code, country, notes
     )
     SELECT organization_id, id, $3, $4, $5, $6, $7, COALESCE($8, 'CA'), $9
     FROM clients
     WHERE organization_id = $1 AND id = $2
     RETURNING ${columns}`,
    [
      organizationId,
      clientId,
      input.addressLine1,
      input.addressLine2 ?? null,
      input.city,
      input.province,
      input.postalCode,
      input.country ?? null,
      input.notes ?? null,
    ],
  );
  return rows[0];
}

export async function updateProperty(
  organizationId: string,
  id: string,
  patch: PropertyPatch,
): Promise<Property | undefined> {
  const set = buildSetClause(patch, patchableColumns, 3);
  if (set.values.length === 0) {
    return findProperty(organizationId, id);
  }

  const { rows } = await pool.query<Property>(
    `UPDATE properties
     SET ${set.assignments}, updated_at = now()
     WHERE organization_id = $1 AND id = $2
     RETURNING ${columns}`,
    [organizationId, id, ...set.values],
  );
  return rows[0];
}

export async function deleteProperty(
  organizationId: string,
  id: string,
): Promise<boolean> {
  const { rowCount } = await pool.query(
    "DELETE FROM properties WHERE organization_id = $1 AND id = $2",
    [organizationId, id],
  );
  return (rowCount ?? 0) > 0;
}
