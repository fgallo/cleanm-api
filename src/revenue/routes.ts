import { Router } from "express";

import * as organizations from "../organizations/repository.ts";
import * as revenue from "./repository.ts";
import { revenueQuerySchema } from "./schemas.ts";

export const revenueRouter = Router();

revenueRouter.get("/", async (req, res) => {
  const query = revenueQuerySchema.parse(req.query);
  const year =
    query.year ??
    Number((await organizations.today(res.locals.organizationId)).slice(0, 4));
  res.json({
    year,
    months: await revenue.monthlyRevenue(res.locals.organizationId, year),
  });
});
