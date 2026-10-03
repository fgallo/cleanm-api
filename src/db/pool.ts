import { Pool, types } from "pg";

import { requiredEnv } from "../env.ts";

// Keep date columns as "YYYY-MM-DD" strings. A calendar date has no time
// zone, and the default conversion to a JS Date can shift it by a day.
types.setTypeParser(types.builtins.DATE, (value) => value);

export const pool = new Pool({ connectionString: requiredEnv("DATABASE_URL") });
