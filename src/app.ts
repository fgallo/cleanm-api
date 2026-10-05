import express from "express";

import { clientsRouter } from "./clients/routes.ts";
import { helpersRouter } from "./helpers/routes.ts";
import { errorHandler, notFoundHandler } from "./http/error-handler.ts";
import { resolveOrganization } from "./http/organization.ts";
import { jobsRouter } from "./jobs/routes.ts";
import { propertiesRouter } from "./properties/routes.ts";

export const app = express();

app.disable("x-powered-by");
app.use(express.json());
app.use(resolveOrganization);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/clients", clientsRouter);
app.use(propertiesRouter);
app.use("/jobs", jobsRouter);
app.use("/helpers", helpersRouter);

app.use(notFoundHandler);
app.use(errorHandler);
