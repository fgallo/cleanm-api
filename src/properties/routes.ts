import { Router } from "express";

import * as clients from "../clients/repository.ts";
import { NotFoundError } from "../http/errors.ts";
import * as properties from "./repository.ts";
import {
  clientPropertiesParamsSchema,
  createPropertySchema,
  propertyIdSchema,
  updatePropertySchema,
} from "./schemas.ts";

// Shallow nesting: the collection lives under its client, a single property
// is addressed by its own id. Paths are complete, so mount without a prefix.
export const propertiesRouter = Router();

propertiesRouter.get("/clients/:clientId/properties", async (req, res) => {
  const { clientId } = clientPropertiesParamsSchema.parse(req.params);
  const client = await clients.findClient(res.locals.organizationId, clientId);
  if (client === undefined) {
    throw new NotFoundError("Client not found");
  }
  res.json(
    await properties.listProperties(res.locals.organizationId, clientId),
  );
});

propertiesRouter.post("/clients/:clientId/properties", async (req, res) => {
  const { clientId } = clientPropertiesParamsSchema.parse(req.params);
  const input = createPropertySchema.parse(req.body);
  const property = await properties.createProperty(
    res.locals.organizationId,
    clientId,
    input,
  );
  if (property === undefined) {
    throw new NotFoundError("Client not found");
  }
  res.status(201).json(property);
});

propertiesRouter.get("/properties/:id", async (req, res) => {
  const { id } = propertyIdSchema.parse(req.params);
  const property = await properties.findProperty(res.locals.organizationId, id);
  if (property === undefined) {
    throw new NotFoundError("Property not found");
  }
  res.json(property);
});

propertiesRouter.patch("/properties/:id", async (req, res) => {
  const { id } = propertyIdSchema.parse(req.params);
  const patch = updatePropertySchema.parse(req.body);
  const property = await properties.updateProperty(
    res.locals.organizationId,
    id,
    patch,
  );
  if (property === undefined) {
    throw new NotFoundError("Property not found");
  }
  res.json(property);
});

propertiesRouter.delete("/properties/:id", async (req, res) => {
  const { id } = propertyIdSchema.parse(req.params);
  const deleted = await properties.deleteProperty(
    res.locals.organizationId,
    id,
  );
  if (!deleted) {
    throw new NotFoundError("Property not found");
  }
  res.status(204).end();
});
