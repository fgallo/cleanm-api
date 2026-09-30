import { integerEnv, requiredEnv } from "./env.ts";

// Server configuration. The database reads its own DATABASE_URL in
// src/db/pool.ts, so scripts like db:migrate do not depend on this.
export const config = {
  port: integerEnv("PORT", 3000),
  organizationId: requiredEnv("ORGANIZATION_ID"),
};
