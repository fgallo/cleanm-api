export type Issue = { path: string; message: string };

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

export class NotFoundError extends HttpError {
  constructor(message = "Not found") {
    super(404, "not_found", message);
    this.name = "NotFoundError";
  }
}

// The request is valid, but the current state does not allow it.
export class ConflictError extends HttpError {
  constructor(message: string) {
    super(409, "conflict", message);
    this.name = "ConflictError";
  }
}

// For input that is well-formed but refers to something that does not exist,
// such as an id in the body. Answers like a Zod failure, with issues per field.
export class ValidationError extends HttpError {
  readonly issues: Issue[];

  constructor(issues: Issue[]) {
    super(400, "validation_error", "Invalid request");
    this.name = "ValidationError";
    this.issues = issues;
  }
}
