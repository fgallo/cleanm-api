import { Router } from "express";

import { NotFoundError, ValidationError } from "../http/errors.ts";
import * as repository from "./repository.ts";
import {
  createRecurringSeriesSchema,
  recurringSeriesIdSchema,
  updateRecurringSeriesSchema,
} from "./schemas.ts";
import * as service from "./service.ts";

export const recurringSeriesRouter = Router();

recurringSeriesRouter.get("/", async (_req, res) => {
  res.json(await repository.listSeries(res.locals.organizationId));
});

recurringSeriesRouter.post("/", async (req, res) => {
  const input = createRecurringSeriesSchema.parse(req.body);
  const created = await service.createSeries(res.locals.organizationId, input);
  if (created === undefined) {
    throw new ValidationError([
      { path: "propertyId", message: "Property not found" },
    ]);
  }
  res.status(201).json(created);
});

recurringSeriesRouter.get("/:id", async (req, res) => {
  const { id } = recurringSeriesIdSchema.parse(req.params);
  const found = await repository.findSeries(res.locals.organizationId, id);
  if (found === undefined) {
    throw new NotFoundError("Recurring series not found");
  }
  res.json(found);
});

recurringSeriesRouter.patch("/:id", async (req, res) => {
  const { id } = recurringSeriesIdSchema.parse(req.params);
  const patch = updateRecurringSeriesSchema.parse(req.body);
  const updated = await service.updateSeries(
    res.locals.organizationId,
    id,
    patch,
  );
  if (updated === undefined) {
    throw new NotFoundError("Recurring series not found");
  }
  res.json(updated);
});

recurringSeriesRouter.delete("/:id", async (req, res) => {
  const { id } = recurringSeriesIdSchema.parse(req.params);
  const deleted = await service.deleteSeries(res.locals.organizationId, id);
  if (!deleted) {
    throw new NotFoundError("Recurring series not found");
  }
  res.status(204).end();
});
