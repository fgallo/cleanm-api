import { pool } from "../db/pool.ts";
import { single } from "../db/rows.ts";

export type Client = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type NewClient = {
  name: string;
  email?: string | null;
  phone?: string | null;
};

// Only the keys present are updated; null clears a field.
export type ClientPatch = Partial<NewClient>;

const patchableColumns = ["name", "email", "phone"] as const;

const columns = `
  id,
  name,
  email,
  phone,
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

export async function listClients(organizationId: string): Promise<Client[]> {
  const { rows } = await pool.query<Client>(
    `SELECT ${columns} FROM clients WHERE organization_id = $1 ORDER BY name`,
    [organizationId],
  );
  return rows;
}

export async function findClient(
  organizationId: string,
  id: string,
): Promise<Client | undefined> {
  const { rows } = await pool.query<Client>(
    `SELECT ${columns} FROM clients WHERE organization_id = $1 AND id = $2`,
    [organizationId, id],
  );
  return rows[0];
}

export async function createClient(
  organizationId: string,
  input: NewClient,
): Promise<Client> {
  const { rows } = await pool.query<Client>(
    `INSERT INTO clients (organization_id, name, email, phone)
     VALUES ($1, $2, $3, $4)
     RETURNING ${columns}`,
    [organizationId, input.name, input.email ?? null, input.phone ?? null],
  );
  return single(rows);
}

export async function updateClient(
  organizationId: string,
  id: string,
  patch: ClientPatch,
): Promise<Client | undefined> {
  const assignments: string[] = [];
  const values: unknown[] = [organizationId, id];
  for (const column of patchableColumns) {
    const value = patch[column];
    if (value !== undefined) {
      values.push(value);
      assignments.push(`${column} = $${values.length}`);
    }
  }
  if (assignments.length === 0) {
    return findClient(organizationId, id);
  }

  const { rows } = await pool.query<Client>(
    `UPDATE clients
     SET ${assignments.join(", ")}, updated_at = now()
     WHERE organization_id = $1 AND id = $2
     RETURNING ${columns}`,
    values,
  );
  return rows[0];
}

export async function deleteClient(
  organizationId: string,
  id: string,
): Promise<boolean> {
  const { rowCount } = await pool.query(
    "DELETE FROM clients WHERE organization_id = $1 AND id = $2",
    [organizationId, id],
  );
  return (rowCount ?? 0) > 0;
}
