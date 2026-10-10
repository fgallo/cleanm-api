import express from "express";
import helmet from "helmet";

import { authRouter } from "./auth/routes.ts";
import { authenticate, requireSession } from "./auth/session.ts";
import { clientsRouter } from "./clients/routes.ts";
import { helpersRouter } from "./helpers/routes.ts";
import { errorHandler, notFoundHandler } from "./http/error-handler.ts";
import { jobsRouter } from "./jobs/routes.ts";
import { propertiesRouter } from "./properties/routes.ts";
import { recurringSeriesRouter } from "./recurring-series/routes.ts";

export const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(express.json());
app.use(authenticate);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/auth", authRouter);

// Everything below belongs to the signed-in user's organization.
app.use(requireSession);
app.use("/clients", clientsRouter);
app.use(propertiesRouter);
app.use("/jobs", jobsRouter);
app.use("/helpers", helpersRouter);
app.use("/recurring-series", recurringSeriesRouter);

app.use(notFoundHandler);
app.use(errorHandler);
