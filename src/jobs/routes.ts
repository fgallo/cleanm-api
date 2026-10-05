import { Router } from "express";

import * as helpers from "../helpers/repository.ts";
import { NotFoundError, ValidationError } from "../http/errors.ts";
import * as jobs from "./repository.ts";
import {
  createJobSchema,
  jobIdSchema,
  listJobsQuerySchema,
  updateJobSchema,
} from "./schemas.ts";

export const jobsRouter = Router();

// The repository cannot tell a missing helper from a missing property in one
// statement, so the helper is checked here; the foreign key still guards it.
async function assertAssignable(
  organizationId: string,
  helperId: string | null | undefined,
): Promise<void> {
  if (helperId === undefined || helperId === null) {
    return;
  }
  const helper = await helpers.findHelper(organizationId, helperId);
  if (helper === undefined) {
    throw new ValidationError([
      { path: "helperId", message: "Helper not found" },
    ]);
  }
  if (!helper.active) {
    throw new ValidationError([
      { path: "helperId", message: "Helper is not active" },
    ]);
  }
}

jobsRouter.get("/", async (req, res) => {
  const range = listJobsQuerySchema.parse(req.query);
  res.json(await jobs.listJobs(res.locals.organizationId, range));
});

jobsRouter.post("/", async (req, res) => {
  const input = createJobSchema.parse(req.body);
  await assertAssignable(res.locals.organizationId, input.helperId);
  const job = await jobs.createJob(res.locals.organizationId, input);
  if (job === undefined) {
    throw new ValidationError([
      { path: "propertyId", message: "Property not found" },
    ]);
  }
  res.status(201).json(job);
});

jobsRouter.get("/:id", async (req, res) => {
  const { id } = jobIdSchema.parse(req.params);
  const job = await jobs.findJob(res.locals.organizationId, id);
  if (job === undefined) {
    throw new NotFoundError("Job not found");
  }
  res.json(job);
});

jobsRouter.patch("/:id", async (req, res) => {
  const { id } = jobIdSchema.parse(req.params);
  const patch = updateJobSchema.parse(req.body);
  await assertAssignable(res.locals.organizationId, patch.helperId);
  const job = await jobs.updateJob(res.locals.organizationId, id, patch);
  if (job === undefined) {
    throw new NotFoundError("Job not found");
  }
  res.json(job);
});

jobsRouter.delete("/:id", async (req, res) => {
  const { id } = jobIdSchema.parse(req.params);
  const deleted = await jobs.deleteJob(res.locals.organizationId, id);
  if (!deleted) {
    throw new NotFoundError("Job not found");
  }
  res.status(204).end();
});
