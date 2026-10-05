import { buildSetClause } from "../db/patch.ts";
import { pool } from "../db/pool.ts";

export const serviceTypes = ["regular", "deep", "move_in", "move_out"] as const;
export type ServiceType = (typeof serviceTypes)[number];

export const jobStatuses = [
  "estimated",
  "scheduled",
  "completed",
  "cancelled",
] as const;
export type JobStatus = (typeof jobStatuses)[number];

export type Job = {
  id: string;
  scheduledDate: string; // YYYY-MM-DD
  startTime: string; // HH:MM:SS
  durationMinutes: number;
  serviceType: ServiceType;
  status: JobStatus;
  hourlyRateCents: number;
  // An agreed price; when null, priceCents is hourly rate x duration.
  fixedPriceCents: number | null;
  priceCents: number;
  notes: string | null;
  property: {
    id: string;
    addressLine1: string;
    addressLine2: string | null;
    city: string;
    province: string;
    postalCode: string;
    country: string;
    notes: string | null;
  };
  client: { id: string; name: string };
  helper: { id: string; name: string } | null;
  createdAt: Date;
  updatedAt: Date;
};

export type NewJob = {
  propertyId: string;
  scheduledDate: string;
  startTime: string;
  durationMinutes: number;
  serviceType: ServiceType;
  status?: JobStatus;
  hourlyRateCents: number;
  fixedPriceCents?: number | null;
  helperId?: string | null;
  notes?: string | null;
};

// Only the keys present are updated; null clears a field.
// The property is chosen at creation: to move a job, delete and recreate it.
export type JobPatch = Partial<Omit<NewJob, "propertyId">>;

const patchableColumns: Record<keyof JobPatch, string> = {
  scheduledDate: "scheduled_date",
  startTime: "start_time",
  durationMinutes: "duration_minutes",
  serviceType: "service_type",
  status: "status",
  hourlyRateCents: "hourly_rate_cents",
  fixedPriceCents: "fixed_price_cents",
  helperId: "helper_id",
  notes: "notes",
};

// Every read joins the property, its client and the helper: the calendar
// shows them with each job, and a separate request per job would be wasteful.
const columns = `
  j.id,
  j.scheduled_date AS "scheduledDate",
  j.start_time AS "startTime",
  j.duration_minutes AS "durationMinutes",
  j.service_type AS "serviceType",
  j.status,
  j.hourly_rate_cents AS "hourlyRateCents",
  j.fixed_price_cents AS "fixedPriceCents",
  COALESCE(
    j.fixed_price_cents,
    round(j.hourly_rate_cents * j.duration_minutes / 60.0)::integer
  ) AS "priceCents",
  j.notes,
  json_build_object(
    'id', p.id,
    'addressLine1', p.address_line1,
    'addressLine2', p.address_line2,
    'city', p.city,
    'province', p.province,
    'postalCode', p.postal_code,
    'country', p.country,
    'notes', p.notes
  ) AS property,
  json_build_object('id', c.id, 'name', c.name) AS client,
  CASE WHEN h.id IS NULL THEN NULL
       ELSE json_build_object('id', h.id, 'name', h.name)
  END AS helper,
  j.created_at AS "createdAt",
  j.updated_at AS "updatedAt"
`;

const joins = `
  JOIN properties p
    ON p.organization_id = j.organization_id AND p.id = j.property_id
  JOIN clients c
    ON c.organization_id = p.organization_id AND c.id = p.client_id
  LEFT JOIN helpers h
    ON h.organization_id = j.organization_id AND h.id = j.helper_id
`;

export async function listJobs(
  organizationId: string,
  range: { from: string; to: string },
): Promise<Job[]> {
  const { rows } = await pool.query<Job>(
    `SELECT ${columns} FROM jobs j ${joins}
     WHERE j.organization_id = $1 AND j.scheduled_date BETWEEN $2 AND $3
     ORDER BY j.scheduled_date, j.start_time, j.id`,
    [organizationId, range.from, range.to],
  );
  return rows;
}

export async function findJob(
  organizationId: string,
  id: string,
): Promise<Job | undefined> {
  const { rows } = await pool.query<Job>(
    `SELECT ${columns} FROM jobs j ${joins}
     WHERE j.organization_id = $1 AND j.id = $2`,
    [organizationId, id],
  );
  return rows[0];
}

// Returns undefined when the property does not exist in the organization:
// the SELECT finds no property, so nothing is inserted. An INSERT ... SELECT
// cannot use the DEFAULT keyword, hence the COALESCE mirroring the default.
export async function createJob(
  organizationId: string,
  input: NewJob,
): Promise<Job | undefined> {
  const { rows } = await pool.query<Job>(
    `WITH inserted AS (
       INSERT INTO jobs (
         organization_id, property_id, scheduled_date, start_time,
         duration_minutes, service_type, status, hourly_rate_cents,
         fixed_price_cents, helper_id, notes
       )
       SELECT organization_id, id, $3, $4, $5, $6, COALESCE($7, 'scheduled'),
              $8, $9, $10, $11
       FROM properties
       WHERE organization_id = $1 AND id = $2
       RETURNING *
     )
     SELECT ${columns} FROM inserted j ${joins}`,
    [
      organizationId,
      input.propertyId,
      input.scheduledDate,
      input.startTime,
      input.durationMinutes,
      input.serviceType,
      input.status ?? null,
      input.hourlyRateCents,
      input.fixedPriceCents ?? null,
      input.helperId ?? null,
      input.notes ?? null,
    ],
  );
  return rows[0];
}

export async function updateJob(
  organizationId: string,
  id: string,
  patch: JobPatch,
): Promise<Job | undefined> {
  const set = buildSetClause(patch, patchableColumns, 3);
  if (set.values.length === 0) {
    return findJob(organizationId, id);
  }

  const { rows } = await pool.query<Job>(
    `WITH updated AS (
       UPDATE jobs
       SET ${set.assignments}, updated_at = now()
       WHERE organization_id = $1 AND id = $2
       RETURNING *
     )
     SELECT ${columns} FROM updated j ${joins}`,
    [organizationId, id, ...set.values],
  );
  return rows[0];
}

export async function deleteJob(
  organizationId: string,
  id: string,
): Promise<boolean> {
  const { rowCount } = await pool.query(
    "DELETE FROM jobs WHERE organization_id = $1 AND id = $2",
    [organizationId, id],
  );
  return (rowCount ?? 0) > 0;
}
