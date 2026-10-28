import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { Writable } from "node:stream";

import express from "express";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createLogger, requestLogger } from "./log.ts";

type Line = Record<string, unknown> & {
  level: number;
  msg: string;
  req?: Record<string, unknown>;
  res?: Record<string, unknown>;
};

// The lines as parsed JSON, instead of stdout.
const lines: Line[] = [];
const logger = createLogger({
  level: "info",
  destination: new Writable({
    write(chunk: Buffer, _encoding, callback) {
      for (const line of chunk.toString().split("\n")) {
        if (line !== "") {
          lines.push(JSON.parse(line) as Line);
        }
      }
      callback();
    },
  }),
});

// A small app of its own: the logging is independent of the API's routes.
const app = express();
app.use(requestLogger(logger));
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});
app.get("/clients", (req, res) => {
  res.json({ requestId: req.id });
});
app.get("/boom", () => {
  throw new Error("boom");
});
const server = app.listen(0);
await once(server, "listening");
const { port } = server.address() as AddressInfo;
const url = (path: string) => `http://localhost:${port}${path}`;

beforeEach(() => {
  lines.length = 0;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe("request log", () => {
  it("writes one line per request, with the id the response carries", async () => {
    const response = await fetch(url("/clients"), {
      headers: { cookie: "session=secret", "user-agent": "test-agent" },
    });
    const body = (await response.json()) as { requestId: string };
    const requestId = response.headers.get("x-request-id");

    expect(requestId).toEqual(expect.any(String));
    expect(body.requestId).toBe(requestId);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      level: 30,
      msg: "GET /clients 200",
      req: {
        id: requestId,
        method: "GET",
        url: "/clients",
        ip: expect.any(String),
        userAgent: "test-agent",
      },
      res: { statusCode: 200 },
      responseTime: expect.any(Number),
    });
    expect(JSON.stringify(lines[0])).not.toContain("secret");
  });

  it("logs a failure on the server side as an error", async () => {
    const response = await fetch(url("/boom"));

    expect(response.status).toBe(500);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ level: 50, msg: "GET /boom 500" });
  });

  it("skips health checks", async () => {
    await fetch(url("/health"));

    expect(lines).toHaveLength(0);
  });
});

describe("redaction", () => {
  it("hides passwords, cookies and authorization wherever they appear", () => {
    logger.info(
      {
        body: { email: "ana@example.com", password: "hunter2" },
        request: {
          headers: { cookie: "session=abc", authorization: "Bearer xyz" },
        },
        response: { headers: { "set-cookie": "session=def" } },
      },
      "something logged by mistake",
    );

    const line = JSON.stringify(lines[0]);
    expect(line).toContain("ana@example.com");
    for (const secret of [
      "hunter2",
      "session=abc",
      "Bearer xyz",
      "session=def",
    ]) {
      expect(line).not.toContain(secret);
    }
    expect(line).toContain("[Redacted]");
  });
});
