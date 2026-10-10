// Development data only. Invented names; never real client data.
import { hashPassword } from "../auth/password.ts";
import * as auth from "../auth/repository.ts";
import { passwordSchema } from "../auth/schemas.ts";
import { requiredEnv } from "../env.ts";
import { pool } from "./pool.ts";

type Organization = { id: string; name: string };

// The two admin users of the MVP (project brief, section 2). Both get the
// password from SEED_ADMIN_PASSWORD, which never enters the repository.
const admins = [
  { email: "ana@example.com", name: "Ana Souza" },
  { email: "bruno@example.com", name: "Bruno Lima" },
];

async function seedOrganization(): Promise<Organization> {
  const existing = await pool.query<Organization>(
    "SELECT id, name FROM organizations ORDER BY created_at LIMIT 1",
  );
  const found = existing.rows[0];
  if (found !== undefined) {
    console.log(`organization "${found.name}" already exists`);
    return found;
  }

  const inserted = await pool.query<Organization>(
    "INSERT INTO organizations (name, timezone) VALUES ($1, $2) RETURNING id, name",
    ["Maple Leaf Cleaning", "America/Toronto"],
  );
  const organization = inserted.rows[0];
  if (organization === undefined) {
    throw new Error("INSERT returned no row");
  }
  console.log(`created organization "${organization.name}"`);
  return organization;
}

async function seedAdmins(organization: Organization): Promise<void> {
  if ((await auth.countUsers()) > 0) {
    console.log("users already exist");
    return;
  }

  const password = passwordSchema.parse(requiredEnv("SEED_ADMIN_PASSWORD"));
  for (const admin of admins) {
    await auth.createUser(organization.id, {
      ...admin,
      passwordHash: await hashPassword(password),
    });
    console.log(`created user ${admin.email}`);
  }
}

try {
  const organization = await seedOrganization();
  await seedAdmins(organization);
} finally {
  await pool.end();
}
