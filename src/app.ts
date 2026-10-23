import cors from "cors";
import express from "express";
import helmet from "helmet";

import { authRouter } from "./auth/routes.ts";
import { authenticate, requireSession } from "./auth/session.ts";
import { clientsRouter } from "./clients/routes.ts";
import { config } from "./config.ts";
import { helpersRouter } from "./helpers/routes.ts";
import { errorHandler, notFoundHandler } from "./http/error-handler.ts";
import { invoicesRouter } from "./invoices/routes.ts";
import { jobsRouter } from "./jobs/routes.ts";
import { organizationRouter } from "./organizations/routes.ts";
import { paymentsRouter } from "./payments/routes.ts";
import { propertiesRouter } from "./properties/routes.ts";
import { recurringSeriesRouter } from "./recurring-series/routes.ts";
import { revenueRouter } from "./revenue/routes.ts";

export const app = express();

app.disable("x-powered-by");
// same-site instead of helmet's same-origin: the web client, on another
// origin of the same site (app.* next to api.*, or another localhost port),
// loads the organization logo in an <img>.
app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));
// The web client sends the session cookie from its own origin: it must be
// listed, and credentials must be allowed. Preflights are answered here.
app.use(cors({ origin: config.webOrigins, credentials: true }));
app.use(express.json());
app.use(authenticate);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/auth", authRouter);

// Everything below belongs to the signed-in user's organization.
app.use(requireSession);
app.use("/organization", organizationRouter);
app.use("/clients", clientsRouter);
app.use(propertiesRouter);
app.use("/jobs", jobsRouter);
app.use("/helpers", helpersRouter);
app.use("/recurring-series", recurringSeriesRouter);
app.use("/invoices", invoicesRouter);
app.use(paymentsRouter);
app.use("/revenue", revenueRouter);

app.use(notFoundHandler);
app.use(errorHandler);
