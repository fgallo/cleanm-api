import { buildSetClause } from "../db/patch.ts";
import { pool } from "../db/pool.ts";
import { single } from "../db/rows.ts";

export type Helper = {
  id: string;
  name: string;
  phone: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type NewHelper = {
  name: string;
  phone?: string | null;
};

// Only the keys present are updated; null clears a field.
export type HelperPatch = Partial<NewHelper> & { active?: boolean };

const patchableColumns: Record<keyof HelperPatch, string> = {
  name: "name",
  phone: "phone",
  active: "active",
};

const columns = `
  id,
  name,
  phone,
  active,
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

// Inactive helpers are listed too, with active = false: the history still
// shows them, and the client decides what to offer for new jobs.
export async function listHelpers(organizationId: string): Promise<Helper[]> {
  const { rows } = await pool.query<Helper>(
    `SELECT ${columns} FROM helpers WHERE organization_id = $1 ORDER BY name`,
    [organizationId],
  );
  return rows;
}

export async function findHelper(
  organizationId: string,
  id: string,
): Promise<Helper | undefined> {
  const { rows } = await pool.query<Helper>(
    `SELECT ${columns} FROM helpers WHERE organization_id = $1 AND id = $2`,
    [organizationId, id],
  );
  return rows[0];
}

export async function createHelper(
  organizationId: string,
  input: NewHelper,
): Promise<Helper> {
  const { rows } = await pool.query<Helper>(
    `INSERT INTO helpers (organization_id, name, phone)
     VALUES ($1, $2, $3)
     RETURNING ${columns}`,
    [organizationId, input.name, input.phone ?? null],
  );
  return single(rows);
}

export async function updateHelper(
  organizationId: string,
  id: string,
  patch: HelperPatch,
): Promise<Helper | undefined> {
  const set = buildSetClause(patch, patchableColumns, 3);
  if (set.values.length === 0) {
    return findHelper(organizationId, id);
  }

  const { rows } = await pool.query<Helper>(
    `UPDATE helpers
     SET ${set.assignments}, updated_at = now()
     WHERE organization_id = $1 AND id = $2
     RETURNING ${columns}`,
    [organizationId, id, ...set.values],
  );
  return rows[0];
}

export async function deleteHelper(
  organizationId: string,
  id: string,
): Promise<boolean> {
  const { rowCount } = await pool.query(
    "DELETE FROM helpers WHERE organization_id = $1 AND id = $2",
    [organizationId, id],
  );
  return (rowCount ?? 0) > 0;
}
