import { Pool } from "pg";

import { requiredEnv } from "../env.ts";

export const pool = new Pool({ connectionString: requiredEnv("DATABASE_URL") });
