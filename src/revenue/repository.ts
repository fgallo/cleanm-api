import { pool } from "../db/pool.ts";
import { amountJoins } from "../invoices/repository.ts";

// One row per month of the year, zeros where nothing happened. Two bases,
// side by side: what was invoiced in the month (and how much of that came
// in, whenever it did), and what came in during the month, whichever invoice
// it paid. Plus the work done in the month that has no invoice yet.
export type MonthlyRevenue = {
  month: string; // YYYY-MM
  invoicedCents: number;
  paidCents: number;
  outstandingCents: number;
  uninvoicedCents: number;
  receivedCents: number;
};

export async function monthlyRevenue(
  organizationId: string,
  year: number,
): Promise<MonthlyRevenue[]> {
  const { rows } = await pool.query<MonthlyRevenue>(
    `WITH months AS (
       SELECT generate_series(
         make_date($2, 1, 1), make_date($2, 12, 1), interval '1 month'
       )::date AS month
     ),
     invoiced AS (
       SELECT date_trunc('month', i.issue_date)::date AS month,
              sum(total.total_cents)::integer AS invoiced_cents,
              sum(paid.paid_cents)::integer AS paid_cents
       FROM invoices i ${amountJoins}
       WHERE i.organization_id = $1
         AND i.issue_date >= make_date($2, 1, 1)
         AND i.issue_date < make_date($2 + 1, 1, 1)
       GROUP BY 1
     ),
     received AS (
       SELECT date_trunc('month', paid_on)::date AS month,
              sum(amount_cents)::integer AS received_cents
       FROM payments
       WHERE organization_id = $1
         AND paid_on >= make_date($2, 1, 1)
         AND paid_on < make_date($2 + 1, 1, 1)
       GROUP BY 1
     ),
     uninvoiced AS (
       SELECT date_trunc('month', j.scheduled_date)::date AS month,
              sum(COALESCE(
                j.fixed_price_cents,
                round(j.hourly_rate_cents * j.duration_minutes / 60.0)::integer
              ))::integer AS uninvoiced_cents
       FROM jobs j
       LEFT JOIN invoices i
         ON i.organization_id = j.organization_id AND i.job_id = j.id
       WHERE j.organization_id = $1
         AND j.status = 'completed'
         AND i.id IS NULL
         AND j.scheduled_date >= make_date($2, 1, 1)
         AND j.scheduled_date < make_date($2 + 1, 1, 1)
       GROUP BY 1
     )
     SELECT to_char(m.month, 'YYYY-MM') AS month,
            COALESCE(inv.invoiced_cents, 0) AS "invoicedCents",
            COALESCE(inv.paid_cents, 0) AS "paidCents",
            COALESCE(inv.invoiced_cents, 0) - COALESCE(inv.paid_cents, 0)
              AS "outstandingCents",
            COALESCE(u.uninvoiced_cents, 0) AS "uninvoicedCents",
            COALESCE(r.received_cents, 0) AS "receivedCents"
     FROM months m
     LEFT JOIN invoiced inv ON inv.month = m.month
     LEFT JOIN received r ON r.month = m.month
     LEFT JOIN uninvoiced u ON u.month = m.month
     ORDER BY m.month`,
    [organizationId, year],
  );
  return rows;
}
