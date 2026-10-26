import { describe, expect, it } from "vitest";

import { startApi } from "../test/api.ts";

const api = await startApi();

describe("trust proxy", () => {
  // TRUST_PROXY=1 in vitest.config.ts. The sign-in limiter counts per client
  // address, and its RateLimit header shows which address a request was
  // credited to: an address not seen before has 99 of 100 attempts left.
  async function attemptsLeft(address: string): Promise<number> {
    const response = await fetch(api.url("/auth/login"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": address,
      },
      body: JSON.stringify({
        email: `${address.replaceAll(".", "-")}@example.com`,
        password: "wrong password",
      }),
    });
    expect(response.status).toBe(401);
    const match = /"100-in-15min"; r=(\d+)/.exec(
      response.headers.get("ratelimit") ?? "",
    );
    expect(match).not.toBeNull();
    return Number(match?.[1]);
  }

  it("takes the client address from X-Forwarded-For", async () => {
    expect(await attemptsLeft("203.0.113.1")).toBe(99);
    expect(await attemptsLeft("203.0.113.2")).toBe(99);
    expect(await attemptsLeft("203.0.113.1")).toBe(98);
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
