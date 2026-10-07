import { z } from "zod";

import { jobTemplate } from "../jobs/schemas.ts";

export const createRecurringSeriesSchema = z
  .object({
    propertyId: z.uuid(),
    // Exactly one of the two rules.
    everyWeeks: z.int().min(1).max(52).optional(),
    dayOfMonth: z.int().min(1).max(31).optional(),
    startDate: z.iso.date(),
    endDate: z.iso.date().nullable().optional(),
    ...jobTemplate,
  })
  .refine(
    (input) =>
      (input.everyWeeks === undefined) !== (input.dayOfMonth === undefined),
    {
      message: "Set either everyWeeks or dayOfMonth",
      path: ["everyWeeks"],
    },
  )
  .refine(
    (input) =>
      input.endDate === undefined ||
      input.endDate === null ||
      input.endDate >= input.startDate,
    { message: "Must not be before startDate", path: ["endDate"] },
  );

// The rule and the property are fixed: to change them, end the series and
// create another. Only the template and the end can change.
export const updateRecurringSeriesSchema = z
  .object({
    endDate: z.iso.date().nullable(),
    ...jobTemplate,
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "At least one field is required",
  });

export const recurringSeriesIdSchema = z.object({ id: z.uuid() });
