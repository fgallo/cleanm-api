import type { RequestHandler } from "express";

import { config } from "../config.ts";

declare global {
  namespace Express {
    interface Locals {
      organizationId: string;
    }
  }
}

// Placeholder until authentication (roadmap step 6): every request belongs to
// the organization configured in ORGANIZATION_ID. This is the only place to
// replace when the organization comes from the authenticated user instead.
export const resolveOrganization: RequestHandler = (_req, res, next) => {
  res.locals.organizationId = config.organizationId;
  next();
};
