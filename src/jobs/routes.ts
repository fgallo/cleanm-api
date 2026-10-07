import { Router } from "express";

import { assertAssignable } from "../helpers/assignable.ts";
import { NotFoundError, ValidationError } from "../http/errors.ts";
import { materialize } from "../recurring-series/service.ts";
import * as jobs from "./repository.ts";
import {
  createJobSchema,
  jobIdSchema,
  listJobsQuerySchema,
  updateJobSchema,
} from "./schemas.ts";

export const jobsRouter = Router();

// Recurring series generate their jobs ahead of time; the calendar asking
// for a range is the moment to make sure they reach that far.
jobsRouter.get("/", async (req, res) => {
  const range = listJobsQuerySchema.parse(req.query);
  await materialize(res.locals.organizationId, range.to);
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
