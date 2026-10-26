import { describe, expect, it, vi } from "vitest";

import { startApi } from "../../test/api.ts";
import { pool } from "../db/pool.ts";

const api = await startApi();

describe("GET /health", () => {
  it("answers ok, without a session", async () => {
    const res = await api.get("/health", { cookie: null });

    expect(res).toEqual({ status: 200, body: { status: "ok" } });
  });

  it("answers 503 when the database does not answer", async () => {
    // Only the health check queries on a request without a session, so the
    // first query is the one to fail.
    const query = vi
      .spyOn(pool, "query")
      .mockRejectedValueOnce(new Error("connect ECONNREFUSED"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await api.get("/health", { cookie: null });

      expect(res).toEqual({
        status: 503,
        body: {
          error: {
            code: "service_unavailable",
            message: "Database unreachable",
          },
        },
      });
      expect(log).toHaveBeenCalledOnce();
    } finally {
      query.mockRestore();
      log.mockRestore();
    }
  });
});
