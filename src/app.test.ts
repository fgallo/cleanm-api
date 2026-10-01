import { describe, expect, it } from "vitest";

import { startApi } from "../test/api.ts";

const api = await startApi();

describe("GET /health", () => {
  it("answers ok", async () => {
    const res = await api.get("/health");

    expect(res).toEqual({ status: 200, body: { status: "ok" } });
  });
});

describe("error responses", () => {
  it("answers 404 for a route that does not exist", async () => {
    const res = await api.get("/nope");

    expect(res).toEqual({
      status: 404,
      body: {
        error: { code: "not_found", message: "Route GET /nope not found" },
      },
    });
  });

  it("answers 400 for a body that is not valid JSON", async () => {
    const response = await fetch(api.url("/clients"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{broken",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "invalid_json",
        message: "Request body is not valid JSON",
      },
    });
  });
});
