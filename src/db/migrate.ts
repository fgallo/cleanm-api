import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { pool } from "./pool.ts";

const migrationsDir = path.resolve(import.meta.dirname, "../../migrations");
const migrationName = /^\d{4}_[a-z0-9_]+\.sql$/;

async function listMigrations(): Promise<string[]> {
  const entries = await readdir(migrationsDir);
  for (const entry of entries) {
    if (!migrationName.test(entry)) {
      throw new Error(`Unexpected file in migrations/: ${entry}`);
    }
  }
  return entries.sort();
}

async function applyMigration(name: string): Promise<void> {
  const sql = await readFile(path.join(migrationsDir, name), "utf8");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [
      name,
    ]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function migrate(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const { rows } = await pool.query<{ name: string }>(
    "SELECT name FROM schema_migrations",
  );
  const applied = new Set(rows.map((row) => row.name));

  const pending = (await listMigrations()).filter((name) => !applied.has(name));
  for (const name of pending) {
    await applyMigration(name);
    console.log(`applied ${name}`);
  }
  console.log(`${pending.length} applied, ${applied.size} already applied`);
}

try {
  await migrate();
} finally {
  await pool.end();
}
