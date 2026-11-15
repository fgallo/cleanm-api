import { buildSetClause } from "../db/patch.ts";
import { pool } from "../db/pool.ts";
import { single } from "../db/rows.ts";

export type Helper = {
  id: string;
  name: string;
  phone: string | null;
  // What the helper is usually paid for an hour of work; null when not set.
  // A job may carry its own rate (helperHourlyRateCents on the job).
  hourlyRateCents: number | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type NewHelper = {
  name: string;
  phone?: string | null;
  hourlyRateCents?: number | null;
};

// Only the keys present are updated; null clears a field.
export type HelperPatch = Partial<NewHelper> & { active?: boolean };

const patchableColumns: Record<keyof HelperPatch, string> = {
  name: "name",
  phone: "phone",
  hourlyRateCents: "hourly_rate_cents",
  active: "active",
};

const columns = `
  id,
  name,
  phone,
  hourly_rate_cents AS "hourlyRateCents",
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
    `INSERT INTO helpers (organization_id, name, phone, hourly_rate_cents)
     VALUES ($1, $2, $3, $4)
     RETURNING ${columns}`,
    [
      organizationId,
      input.name,
      input.phone ?? null,
      input.hourlyRateCents ?? null,
    ],
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
  const values = [organizationId, id, ...set.values];

  // A new usual rate is for the work still to come. The jobs before today
  // that were paid the usual rate (they carry none of their own) get the
  // previous one written on them, in the same statement, so what the helper
  // was paid for work already done never changes with a later edit.
  let keepPastRate = "";
  if (patch.hourlyRateCents !== undefined) {
    values.push(patch.hourlyRateCents);
    keepPastRate = `WITH previous AS (
       SELECT h.hourly_rate_cents,
              (now() AT TIME ZONE o.timezone)::date AS today
       FROM helpers h
       JOIN organizations o ON o.id = h.organization_id
       WHERE h.organization_id = $1 AND h.id = $2
     ),
     kept AS (
       UPDATE jobs j
       SET helper_hourly_rate_cents = previous.hourly_rate_cents
       FROM previous
       WHERE j.organization_id = $1 AND j.helper_id = $2
         AND j.helper_hourly_rate_cents IS NULL
         AND j.scheduled_date < previous.today
         AND previous.hourly_rate_cents IS NOT NULL
         AND previous.hourly_rate_cents IS DISTINCT FROM $${values.length}
     )`;
  }

  const { rows } = await pool.query<Helper>(
    `${keepPastRate}
     UPDATE helpers
     SET ${set.assignments}, updated_at = now()
     WHERE organization_id = $1 AND id = $2
     RETURNING ${columns}`,
    values,
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
