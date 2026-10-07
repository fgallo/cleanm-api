import { pool } from "../db/pool.ts";
import { single } from "../db/rows.ts";

// Today's date on the organization's calendar, as YYYY-MM-DD. "Today" depends
// on the time zone: late evening in Toronto is already tomorrow in UTC.
export async function today(organizationId: string): Promise<string> {
  const { rows } = await pool.query<{ today: string }>(
    `SELECT (now() AT TIME ZONE timezone)::date AS today
     FROM organizations WHERE id = $1`,
    [organizationId],
  );
  return single(rows).today;
}
