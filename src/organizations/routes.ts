import { Router } from "express";

import * as organizations from "./repository.ts";
import { updateOrganizationSchema } from "./schemas.ts";

// The signed-in user's organization: a single resource, so no id in the path.
export const organizationRouter = Router();

organizationRouter.get("/", async (_req, res) => {
  res.json(await organizations.findOrganization(res.locals.organizationId));
});

organizationRouter.patch("/", async (req, res) => {
  const patch = updateOrganizationSchema.parse(req.body);
  res.json(
    await organizations.updateOrganization(res.locals.organizationId, patch),
  );
});
