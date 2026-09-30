import { Router } from "express";

import { NotFoundError } from "../http/errors.ts";
import * as clients from "./repository.ts";
import {
  clientIdSchema,
  createClientSchema,
  updateClientSchema,
} from "./schemas.ts";

export const clientsRouter = Router();

clientsRouter.get("/", async (_req, res) => {
  res.json(await clients.listClients(res.locals.organizationId));
});

clientsRouter.post("/", async (req, res) => {
  const input = createClientSchema.parse(req.body);
  const client = await clients.createClient(res.locals.organizationId, input);
  res.status(201).json(client);
});

clientsRouter.get("/:id", async (req, res) => {
  const { id } = clientIdSchema.parse(req.params);
  const client = await clients.findClient(res.locals.organizationId, id);
  if (client === undefined) {
    throw new NotFoundError("Client not found");
  }
  res.json(client);
});

clientsRouter.patch("/:id", async (req, res) => {
  const { id } = clientIdSchema.parse(req.params);
  const patch = updateClientSchema.parse(req.body);
  const client = await clients.updateClient(
    res.locals.organizationId,
    id,
    patch,
  );
  if (client === undefined) {
    throw new NotFoundError("Client not found");
  }
  res.json(client);
});

clientsRouter.delete("/:id", async (req, res) => {
  const { id } = clientIdSchema.parse(req.params);
  const deleted = await clients.deleteClient(res.locals.organizationId, id);
  if (!deleted) {
    throw new NotFoundError("Client not found");
  }
  res.status(204).end();
});
