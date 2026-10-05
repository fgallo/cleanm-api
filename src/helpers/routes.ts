import { Router } from "express";

import { NotFoundError } from "../http/errors.ts";
import * as helpers from "./repository.ts";
import {
  createHelperSchema,
  helperIdSchema,
  updateHelperSchema,
} from "./schemas.ts";

export const helpersRouter = Router();

helpersRouter.get("/", async (_req, res) => {
  res.json(await helpers.listHelpers(res.locals.organizationId));
});

helpersRouter.post("/", async (req, res) => {
  const input = createHelperSchema.parse(req.body);
  const helper = await helpers.createHelper(res.locals.organizationId, input);
  res.status(201).json(helper);
});

helpersRouter.get("/:id", async (req, res) => {
  const { id } = helperIdSchema.parse(req.params);
  const helper = await helpers.findHelper(res.locals.organizationId, id);
  if (helper === undefined) {
    throw new NotFoundError("Helper not found");
  }
  res.json(helper);
});

helpersRouter.patch("/:id", async (req, res) => {
  const { id } = helperIdSchema.parse(req.params);
  const patch = updateHelperSchema.parse(req.body);
  const helper = await helpers.updateHelper(
    res.locals.organizationId,
    id,
    patch,
  );
  if (helper === undefined) {
    throw new NotFoundError("Helper not found");
  }
  res.json(helper);
});

helpersRouter.delete("/:id", async (req, res) => {
  const { id } = helperIdSchema.parse(req.params);
  const deleted = await helpers.deleteHelper(res.locals.organizationId, id);
  if (!deleted) {
    throw new NotFoundError("Helper not found");
  }
  res.status(204).end();
});
