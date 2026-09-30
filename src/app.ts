import express from "express";

import { clientsRouter } from "./clients/routes.ts";
import { errorHandler, notFoundHandler } from "./http/error-handler.ts";
import { resolveOrganization } from "./http/organization.ts";

export const app = express();

app.disable("x-powered-by");
app.use(express.json());
app.use(resolveOrganization);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/clients", clientsRouter);

app.use(notFoundHandler);
app.use(errorHandler);
