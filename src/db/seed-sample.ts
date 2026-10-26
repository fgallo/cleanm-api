// Fills the development organization with invented clients, visits, invoices
// and payments (see sample-data.ts). Run once, after `npm run db:seed`.
import { pool } from "./pool.ts";
import { createSampleData } from "./sample-data.ts";
import type { SampleDataSummary } from "./sample-data.ts";

type Organization = { id: string; name: string; clients: number };

const labels: Record<keyof SampleDataSummary, string> = {
  clients: "clients",
  properties: "properties",
  helpers: "helpers",
  recurringSeries: "recurring series",
  jobs: "jobs",
  invoices: "invoices",
  payments: "payments",
};

try {
  const { rows } = await pool.query<Organization>(
    `SELECT o.id, o.name,
            (SELECT count(*) FROM clients c WHERE c.organization_id = o.id)::int
              AS clients
     FROM organizations o
     ORDER BY o.created_at
     LIMIT 1`,
  );
  const organization = rows[0];
  if (organization === undefined) {
    throw new Error("No organization yet: run `npm run db:seed` first");
  }

  if (organization.clients > 0) {
    console.log(
      `"${organization.name}" already has ${organization.clients} clients, nothing done.`,
    );
    console.log(
      "To start over: dropdb cleanm_dev && createdb cleanm_dev, then db:migrate, db:seed and db:seed:sample.",
    );
  } else {
    const summary = await createSampleData(organization.id);
    console.log(`filled "${organization.name}" with sample data:`);
    for (const key of Object.keys(labels) as Array<keyof SampleDataSummary>) {
      console.log(`  ${summary[key]} ${labels[key]}`);
    }
  }
} finally {
  await pool.end();
}
