// One logger for the process and one line per request. JSON lines, which the
// hosts index and filter, except in a terminal, where they are made readable.
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import type { Request, RequestHandler } from "express";
import { pino } from "pino";
import type { DestinationStream, Logger, LoggerOptions } from "pino";
import { pinoHttp } from "pino-http";

import { config } from "./config.ts";

// Whatever gets logged, these never do (security checklist, project brief
// section 8). Pino replaces them with "[Redacted]" under any top-level key,
// so an object logged by mistake, such as a request body, is still safe.
const redact = [
  "*.password",
  "*.cookie",
  "*.headers.cookie",
  "*.headers.authorization",
  '*.headers["set-cookie"]',
];

export type LoggerSettings = {
  level?: string;
  // Where the lines go; stdout when not given.
  destination?: DestinationStream;
};

export function createLogger(settings: LoggerSettings = {}): Logger {
  const options: LoggerOptions = {
    level: settings.level ?? config.logLevel,
    redact,
  };
  if (settings.destination !== undefined) {
    return pino(options, settings.destination);
  }
  // A terminal, as with `npm run dev`, gets readable lines; a host gets JSON.
  if (!config.production && process.stdout.isTTY) {
    return pino({
      ...options,
      transport: {
        target: "pino-pretty",
        options: { translateTime: "SYS:HH:MM:ss", ignore: "pid,hostname" },
      },
    });
  }
  return pino(options);
}

export const log = createLogger();

// What pino-http hands to the serializers: its standard serialization, with
// the request or response itself as `raw`.
type SerializedRequest = {
  id?: unknown;
  method?: string;
  url?: string;
  headers: Record<string, string | undefined>;
  raw: IncomingMessage;
};
type SerializedResponse = { statusCode: number };

// Logs each request when its response ends: method, path, status, duration,
// the client address (the real one behind the proxy, see TRUST_PROXY) and a
// request id, which the response also carries in X-Request-Id so a user can
// quote it. Routes get the same id on `req.id` and a logger on `req.log`.
// Health checks are not logged: the host polls every few seconds, and those
// lines would drown everything else.
export function requestLogger(logger: Logger = log): RequestHandler {
  return pinoHttp({
    logger,
    genReqId: (_req, res) => {
      const id = randomUUID();
      res.setHeader("x-request-id", id);
      return id;
    },
    autoLogging: { ignore: (req) => req.url === "/health" },
    // A 4xx is the client's mistake and a normal day for an API; only a
    // failure on this side is an error.
    customLogLevel: (_req, res, error) =>
      error !== undefined || res.statusCode >= 500 ? "error" : "info",
    customSuccessMessage: requestLine,
    customErrorMessage: requestLine,
    serializers: {
      req: (req: SerializedRequest) => {
        // The path as requested and the address behind the proxy are
        // Express's, on the request itself.
        const { originalUrl, ip } = req.raw as Request;
        return {
          id: req.id,
          method: req.method,
          url: originalUrl ?? req.url,
          ip,
          userAgent: req.headers["user-agent"],
        };
      },
      res: (res: SerializedResponse) => ({ statusCode: res.statusCode }),
    },
  });
}

function requestLine(req: IncomingMessage, res: ServerResponse): string {
  const { originalUrl } = req as Request;
  return `${req.method} ${originalUrl ?? req.url} ${res.statusCode}`;
}
