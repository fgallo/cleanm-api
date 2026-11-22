// The helpers of a job, and of a series as the template of its jobs. Both
// keep them in a table of their own, one row per helper, so the SQL that
// reads and writes them is here once and is told which of the two it is for.

// A helper as a job or a series reads them. `helper.hourlyRateCents` is
// their usual rate; `hourlyRateCents` next to it is what this job pays them
// for an hour when it is not the usual rate, and null means the usual rate.
// `payCents` is what the job pays them: the rate in effect for the time they
// are at the house, null while they have no rate at all.
export type AssignedHelper = {
  helper: { id: string; name: string; hourlyRateCents: number | null };
  hourlyRateCents: number | null;
  payCents: number | null;
};

// A helper as a request assigns them.
export type HelperAssignment = {
  helperId: string;
  hourlyRateCents?: number | null;
};

// Where the helpers of a row are kept: the table, and its column that points
// at the row.
type Assignments = { table: string; key: string };

export const jobHelpers: Assignments = {
  table: "job_helpers",
  key: "job_id",
};

export const seriesHelpers: Assignments = {
  table: "recurring_series_helpers",
  key: "recurring_series_id",
};

// A join that works out who does the row aliased `row`, as `team`. The hours
// of a job are hours of cleaning, shared by the people who do it: its helpers
// and the owner of the business, when the owner works on it. So
// `team.people` is how many they are, one when nobody is marked, and
// `team.on_site_minutes` how long the job takes them at the house, rounded
// to the minute. Always one row: a count of no helpers is still a row.
export function teamJoin({ table, key }: Assignments, row: string): string {
  return `
    CROSS JOIN LATERAL (
      SELECT
        counted.people,
        GREATEST(
          round(${row}.duration_minutes::numeric / counted.people), 1
        )::integer AS on_site_minutes
      FROM (
        SELECT
          GREATEST(count(*) + ${row}.owner_works::integer, 1)::integer AS people
        FROM ${table} a
        WHERE a.organization_id = ${row}.organization_id
          AND a.${key} = ${row}.id
      ) counted
    ) team`;
}

// The column that lists the helpers of the row aliased `row`, by name, each
// with what the job pays them: for the time at the house, so it reads `team`
// (`teamJoin`).
export function assignedHelpersColumn(
  { table, key }: Assignments,
  row: string,
): string {
  return `(
    SELECT COALESCE(
      json_agg(
        json_build_object(
          'helper', json_build_object(
            'id', h.id,
            'name', h.name,
            'hourlyRateCents', h.hourly_rate_cents
          ),
          'hourlyRateCents', a.hourly_rate_cents,
          'payCents', round(
            COALESCE(a.hourly_rate_cents, h.hourly_rate_cents)
              * team.on_site_minutes / 60.0
          )::integer
        )
        ORDER BY h.name, h.id
      ),
      '[]'::json
    )
    FROM ${table} a
    JOIN helpers h
      ON h.organization_id = a.organization_id AND h.id = a.helper_id
    WHERE a.organization_id = ${row}.organization_id AND a.${key} = ${row}.id
  ) AS helpers`;
}

// Helpers as a statement takes them, in two parameters: their ids and, in
// the same order, the rate of each.
export function assignmentArrays(
  assignments: HelperAssignment[],
): [string[], Array<number | null>] {
  return [
    assignments.map((assignment) => assignment.helperId),
    assignments.map((assignment) => assignment.hourlyRateCents ?? null),
  ];
}

// A CTE that gives the rows of `rows` (their `organization_id` and `id`) the
// helpers in the parameters `ids` and `rates`. One that a row already has
// takes the rate given.
export function assignHelpers(
  { table, key }: Assignments,
  rows: string,
  ids: string,
  rates: string,
): string {
  return `assigned AS (
    INSERT INTO ${table} (organization_id, ${key}, helper_id, hourly_rate_cents)
    SELECT r.organization_id, r.id, given.helper_id, given.hourly_rate_cents
    FROM ${rows} r,
         unnest(${ids}::uuid[], ${rates}::integer[])
           AS given(helper_id, hourly_rate_cents)
    ON CONFLICT (${key}, helper_id)
      DO UPDATE SET hourly_rate_cents = EXCLUDED.hourly_rate_cents
  )`;
}

// A CTE that takes from the rows of `rows` every helper that is not in the
// parameter `ids`. With `assignHelpers` in the same statement, the helpers
// given become the helpers of those rows: the two never touch the same row.
export function unassignOtherHelpers(
  { table, key }: Assignments,
  rows: string,
  ids: string,
): string {
  return `unassigned AS (
    DELETE FROM ${table} a
    USING ${rows} r
    WHERE a.organization_id = r.organization_id AND a.${key} = r.id
      AND a.helper_id <> ALL(${ids}::uuid[])
  )`;
}

// The helpers a job or a series has, as a request would assign them.
export function assignmentsOf(helpers: AssignedHelper[]): HelperAssignment[] {
  return helpers.map((assigned) => ({
    helperId: assigned.helper.id,
    hourlyRateCents: assigned.hourlyRateCents,
  }));
}

// True when both are the same helpers at the same rates, in any order.
export function sameAssignments(
  one: HelperAssignment[],
  other: HelperAssignment[],
): boolean {
  if (one.length !== other.length) {
    return false;
  }
  const rates = new Map(
    one.map((assignment) => [
      assignment.helperId,
      assignment.hourlyRateCents ?? null,
    ]),
  );
  return other.every(
    (assignment) =>
      rates.has(assignment.helperId) &&
      rates.get(assignment.helperId) === (assignment.hourlyRateCents ?? null),
  );
}
