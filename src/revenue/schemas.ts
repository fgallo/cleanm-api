import { z } from "zod";

// Query strings are text: coerce the year. Defaults to the current year on
// the organization's calendar, which the route resolves.
export const revenueQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});
