import { Router } from "express";

import { pool } from "../db/pool.ts";

export const healthRouter = Router();

// For the host's health check, and a quick look by hand. The database is the
// one dependency: a process that cannot reach it serves nothing, and a wrong
// DATABASE_URL is the likeliest mistake at deploy time, so the answer is 503
// until the database answers.
healthRouter.get("/", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
  } catch (error) {
    console.error(error);
    res.status(503).json({
      error: { code: "service_unavailable", message: "Database unreachable" },
    });
    return;
  }
  res.json({ status: "ok" });
});
