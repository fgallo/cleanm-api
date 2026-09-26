import { Pool } from "pg";

import { config } from "../config.ts";

export const pool = new Pool({ connectionString: config.databaseUrl });
