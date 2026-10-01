import { execFileSync } from "node:child_process";

import type { TestProject } from "vitest/node";

// Runs once before the test files: brings the test database up to date with
// the same migration runner as `npm run db:migrate`.
export default function setup(project: TestProject): void {
  execFileSync(process.execPath, ["src/db/migrate.ts"], {
    cwd: project.config.root,
    env: { ...process.env, DATABASE_URL: project.config.env.DATABASE_URL },
  });
}
