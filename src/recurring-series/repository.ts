import { buildSetClause } from "../db/patch.ts";
import { pool } from "../db/pool.ts";
import type { ServiceType } from "../jobs/repository.ts";

export type RecurringSeries = {
  id: string;
  // Exactly one of the two is set.
  everyWeeks: number | null;
  dayOfMonth: number | null;
  startDate: string; // YYYY-MM-DD
  endDate: string | null;
  // Jobs exist up to this date; null before the first generation.
  generatedUntil: string | null;
  // Template of the generated jobs.
  startTime: string; // HH:MM:SS
  durationMinutes: number;
  serviceType: ServiceType;
  hourlyRateCents: number;
  fixedPriceCents: number | null;
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

export type JobTemplate = {
  startTime: string;
  durationMinutes: number;
  serviceType: ServiceType;
  hourlyRateCents: number;
  fixedPriceCents?: number | null;
  helperId?: string | null;
  notes?: string | null;
};

export type NewRecurringSeries = JobTemplate & {
  propertyId: string;
  everyWeeks?: number | null;
  dayOfMonth?: number | null;
  startDate: string;
  endDate?: string | null;
};

// Only the keys present are updated; null clears a field. The rule and the
// property are fixed: to change them, end the series and create another.
export type RecurringSeriesPatch = Partial<JobTemplate> & {
  endDate?: string | null;
};

export const templateColumns: Record<keyof JobTemplate, string> = {
  startTime: "start_time",
  durationMinutes: "duration_minutes",
  serviceType: "service_type",
  hourlyRateCents: "hourly_rate_cents",
  fixedPriceCents: "fixed_price_cents",
  helperId: "helper_id",
  notes: "notes",
};

const patchableColumns: Record<keyof RecurringSeriesPatch, string> = {
  ...templateColumns,
  endDate: "end_date",
};

const columns = `
  s.id,
  s.every_weeks AS "everyWeeks",
  s.day_of_month AS "dayOfMonth",
  s.start_date AS "startDate",
  s.end_date AS "endDate",
  s.generated_until AS "generatedUntil",
  s.start_time AS "startTime",
  s.duration_minutes AS "durationMinutes",
  s.service_type AS "serviceType",
  s.hourly_rate_cents AS "hourlyRateCents",
  s.fixed_price_cents AS "fixedPriceCents",
  s.notes,
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
  s.created_at AS "createdAt",
  s.updated_at AS "updatedAt"
`;

const joins = `
  JOIN properties p
    ON p.organization_id = s.organization_id AND p.id = s.property_id
  JOIN clients c
    ON c.organization_id = p.organization_id AND c.id = p.client_id
  LEFT JOIN helpers h
    ON h.organization_id = s.organization_id AND h.id = s.helper_id
`;

export async function listSeries(
  organizationId: string,
): Promise<RecurringSeries[]> {
  const { rows } = await pool.query<RecurringSeries>(
    `SELECT ${columns} FROM recurring_series s ${joins}
     WHERE s.organization_id = $1
     ORDER BY c.name, s.start_date, s.id`,
    [organizationId],
  );
  return rows;
}

export async function findSeries(
  organizationId: string,
  id: string,
): Promise<RecurringSeries | undefined> {
  const { rows } = await pool.query<RecurringSeries>(
    `SELECT ${columns} FROM recurring_series s ${joins}
     WHERE s.organization_id = $1 AND s.id = $2`,
    [organizationId, id],
  );
  return rows[0];
}

// Returns undefined when the property does not exist in the organization.
export async function createSeries(
  organizationId: string,
  input: NewRecurringSeries,
): Promise<RecurringSeries | undefined> {
  const { rows } = await pool.query<RecurringSeries>(
    `WITH inserted AS (
       INSERT INTO recurring_series (
         organization_id, property_id, every_weeks, day_of_month, start_date,
         end_date, start_time, duration_minutes, service_type,
         hourly_rate_cents, fixed_price_cents, helper_id, notes
       )
       SELECT organization_id, id, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
              $13
       FROM properties
       WHERE organization_id = $1 AND id = $2
       RETURNING *
     )
     SELECT ${columns} FROM inserted s ${joins}`,
    [
      organizationId,
      input.propertyId,
      input.everyWeeks ?? null,
      input.dayOfMonth ?? null,
      input.startDate,
      input.endDate ?? null,
      input.startTime,
      input.durationMinutes,
      input.serviceType,
      input.hourlyRateCents,
      input.fixedPriceCents ?? null,
      input.helperId ?? null,
      input.notes ?? null,
    ],
  );
  return rows[0];
}

export async function updateSeries(
  organizationId: string,
  id: string,
  patch: RecurringSeriesPatch,
): Promise<RecurringSeries | undefined> {
  const set = buildSetClause(patch, patchableColumns, 3);
  if (set.values.length === 0) {
    return findSeries(organizationId, id);
  }

  const { rows } = await pool.query<RecurringSeries>(
    `WITH updated AS (
       UPDATE recurring_series
       SET ${set.assignments}, updated_at = now()
       WHERE organization_id = $1 AND id = $2
       RETURNING *
     )
     SELECT ${columns} FROM updated s ${joins}`,
    [organizationId, id, ...set.values],
  );
  return rows[0];
}

// Deletes the series together with its jobs, in one statement so the foreign
// key sees both. The service makes sure none of those jobs happened.
export async function deleteSeries(
  organizationId: string,
  id: string,
): Promise<boolean> {
  const { rowCount } = await pool.query(
    `WITH jobs_gone AS (
       DELETE FROM jobs
       WHERE organization_id = $1 AND recurring_series_id = $2
     )
     DELETE FROM recurring_series WHERE organization_id = $1 AND id = $2`,
    [organizationId, id],
  );
  return (rowCount ?? 0) > 0;
}

// --- Generation -----------------------------------------------------------

export type SeriesToGenerate = {
  id: string;
  everyWeeks: number | null;
  dayOfMonth: number | null;
  startDate: string;
  endDate: string | null;
  generatedUntil: string | null;
};

// Series whose jobs do not reach `until` yet.
export async function listSeriesToGenerate(
  organizationId: string,
  until: string,
): Promise<SeriesToGenerate[]> {
  const { rows } = await pool.query<SeriesToGenerate>(
    `SELECT
       id,
       every_weeks AS "everyWeeks",
       day_of_month AS "dayOfMonth",
       start_date AS "startDate",
       end_date AS "endDate",
       generated_until AS "generatedUntil"
     FROM recurring_series
     WHERE organization_id = $1
       AND (generated_until IS NULL OR generated_until < $2)
     ORDER BY id`,
    [organizationId, until],
  );
  return rows;
}

// Creates the jobs for the given dates from the series template and moves
// generated_until forward, in one statement. The UPDATE only matches when
// generated_until is still what the caller saw, so two concurrent callers
// cannot both insert the same dates: the second one updates nothing.
export async function generateJobs(
  organizationId: string,
  seriesId: string,
  seenGeneratedUntil: string | null,
  dates: string[],
  until: string,
): Promise<number> {
  const { rowCount } = await pool.query(
    `WITH claimed AS (
       UPDATE recurring_series
       SET generated_until = $4
       WHERE organization_id = $1 AND id = $2
         AND generated_until IS NOT DISTINCT FROM $3
       RETURNING *
     )
     INSERT INTO jobs (
       organization_id, property_id, helper_id, recurring_series_id,
       scheduled_date, start_time, duration_minutes, service_type,
       hourly_rate_cents, fixed_price_cents, notes
     )
     SELECT s.organization_id, s.property_id, s.helper_id, s.id, d.date,
            s.start_time, s.duration_minutes, s.service_type,
            s.hourly_rate_cents, s.fixed_price_cents, s.notes
     FROM claimed s, unnest($5::date[]) AS d(date)`,
    [organizationId, seriesId, seenGeneratedUntil, until, dates],
  );
  return rowCount ?? 0;
}

// --- Propagation to upcoming jobs ----------------------------------------

export type TemplateChange = {
  column: string;
  from: unknown;
  to: unknown;
};

// Applies template changes to the upcoming, not yet realized jobs of the
// series, field by field: a field is only changed where the job still had
// the series' previous value, so edits made to a single visit are kept.
export async function propagateTemplate(
  organizationId: string,
  seriesId: string,
  today: string,
  changes: TemplateChange[],
): Promise<number> {
  if (changes.length === 0) {
    return 0;
  }
  const values: unknown[] = [organizationId, seriesId, today];
  const assignments: string[] = [];
  const touched: string[] = [];
  for (const change of changes) {
    values.push(change.from, change.to);
    const from = `$${values.length - 1}`;
    const to = `$${values.length}`;
    assignments.push(
      `${change.column} = CASE WHEN ${change.column} IS NOT DISTINCT FROM ${from}
                                THEN ${to} ELSE ${change.column} END`,
    );
    touched.push(`${change.column} IS NOT DISTINCT FROM ${from}`);
  }

  const { rowCount } = await pool.query(
    `UPDATE jobs
     SET ${assignments.join(", ")}, updated_at = now()
     WHERE organization_id = $1 AND recurring_series_id = $2
       AND scheduled_date >= $3
       AND status IN ('scheduled', 'estimated')
       AND (${touched.join(" OR ")})`,
    values,
  );
  return rowCount ?? 0;
}

// After end_date was set: removes the unrealized jobs past the end, and pulls
// generated_until back to the end so a later reopening resumes from there.
export async function trimAfterEnd(
  organizationId: string,
  seriesId: string,
): Promise<number> {
  const { rowCount } = await pool.query(
    `WITH ended AS (
       UPDATE recurring_series
       SET generated_until = LEAST(generated_until, end_date)
       WHERE organization_id = $1 AND id = $2 AND end_date IS NOT NULL
       RETURNING end_date
     )
     DELETE FROM jobs
     USING ended
     WHERE jobs.organization_id = $1 AND jobs.recurring_series_id = $2
       AND jobs.scheduled_date > ended.end_date
       AND jobs.status IN ('scheduled', 'estimated')`,
    [organizationId, seriesId],
  );
  return rowCount ?? 0;
}

// True once any job of the series was completed or cancelled.
export async function hasHistory(
  organizationId: string,
  seriesId: string,
): Promise<boolean> {
  const { rows } = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM jobs
       WHERE organization_id = $1 AND recurring_series_id = $2
         AND status IN ('completed', 'cancelled')
     ) AS exists`,
    [organizationId, seriesId],
  );
  return rows[0]?.exists ?? false;
}
