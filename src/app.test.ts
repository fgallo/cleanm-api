import { describe, expect, it } from "vitest";

import { startApi } from "../test/api.ts";

const api = await startApi();

describe("GET /health", () => {
  it("answers ok", async () => {
    const res = await api.get("/health");

    expect(res).toEqual({ status: 200, body: { status: "ok" } });
  });
});

describe("CORS", () => {
  const allowed = "http://localhost:5173";

  it("answers the preflight of an allowed origin, with credentials", async () => {
    const response = await fetch(api.url("/clients"), {
      method: "OPTIONS",
      headers: {
        origin: allowed,
        "access-control-request-method": "PATCH",
        "access-control-request-headers": "content-type",
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(allowed);
    expect(response.headers.get("access-control-allow-credentials")).toBe(
      "true",
    );
    expect(response.headers.get("access-control-allow-methods")).toContain(
      "PATCH",
    );
    expect(response.headers.get("access-control-allow-headers")).toContain(
      "content-type",
    );
  });

  it("allows an actual request from that origin", async () => {
    const response = await fetch(api.url("/health"), {
      headers: { origin: allowed },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(allowed);
    expect(response.headers.get("vary")).toContain("Origin");
  });

  it("gives no CORS headers to another origin", async () => {
    const response = await fetch(api.url("/health"), {
      headers: { origin: "https://evil.example" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("lets a resource be embedded across the site, not across origins", async () => {
    const response = await fetch(api.url("/health"));

    expect(response.headers.get("cross-origin-resource-policy")).toBe(
      "same-site",
    );
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
