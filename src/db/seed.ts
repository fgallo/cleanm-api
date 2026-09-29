// Development data only. Invented names; never real client data.
import { pool } from "./pool.ts";

type Organization = { id: string; name: string };

async function seed(): Promise<void> {
  const existing = await pool.query<Organization>(
    "SELECT id, name FROM organizations ORDER BY created_at LIMIT 1",
  );
  let organization = existing.rows[0];

  if (organization === undefined) {
    const inserted = await pool.query<Organization>(
      "INSERT INTO organizations (name, timezone) VALUES ($1, $2) RETURNING id, name",
      ["Maple Leaf Cleaning", "America/Toronto"],
    );
    organization = inserted.rows[0];
    if (organization === undefined) {
      throw new Error("INSERT returned no row");
    }
    console.log(`created organization "${organization.name}"`);
  } else {
    console.log(`organization "${organization.name}" already exists`);
  }

  console.log(`ORGANIZATION_ID=${organization.id}`);
}

try {
  await seed();
} finally {
  await pool.end();
}
