import type { ErrorRequestHandler, RequestHandler } from "express";
import { DatabaseError } from "pg";
import { ZodError } from "zod";

import { HttpError, ValidationError } from "./errors.ts";

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: {
      code: "not_found",
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
};

// Express only treats a function with four parameters as an error handler.
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "validation_error",
        message: "Invalid request",
        issues: error.issues.map((issue) => ({
          path: issue.path.map(String).join("."),
          message: issue.message,
        })),
      },
    });
    return;
  }

  if (error instanceof ValidationError) {
    res.status(error.status).json({
      error: { code: error.code, message: error.message, issues: error.issues },
    });
    return;
  }

  if (error instanceof HttpError) {
    res
      .status(error.status)
      .json({ error: { code: error.code, message: error.message } });
    return;
  }

  if (isJsonParseError(error)) {
    res.status(400).json({
      error: {
        code: "invalid_json",
        message: "Request body is not valid JSON",
      },
    });
    return;
  }

  // A row that other rows still reference cannot be deleted. Only deletes
  // raise this: inserts select the referenced row first instead.
  if (error instanceof DatabaseError && error.code === "23503") {
    res.status(409).json({
      error: {
        code: "conflict",
        message: `Cannot delete: still referenced by ${error.table ?? "other records"}`,
      },
    });
    return;
  }

  console.error(error);
  res.status(500).json({
    error: { code: "internal_error", message: "Something went wrong" },
  });
};

// Raised by express.json() when the body cannot be parsed.
function isJsonParseError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    error.type === "entity.parse.failed"
  );
}
