import { z } from "zod";

import { jobStatuses, serviceTypes } from "./repository.ts";

const cents = z.int().min(0);
const notes = z.string().trim().min(1).max(2000).nullable();

export const createJobSchema = z.object({
  propertyId: z.uuid(),
  scheduledDate: z.iso.date(),
  startTime: z.iso.time(),
  durationMinutes: z
    .int()
    .positive()
    .max(24 * 60),
  serviceType: z.enum(serviceTypes),
  status: z.enum(jobStatuses).optional(),
  hourlyRateCents: cents,
  // null means the price is hourly rate x duration.
  fixedPriceCents: cents.nullable().optional(),
  // null means nobody is assigned yet.
  helperId: z.uuid().nullable().optional(),
  notes: notes.optional(),
});

// The property is chosen at creation: to move a job, delete and recreate it.
export const updateJobSchema = createJobSchema
  .omit({ propertyId: true })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "At least one field is required",
  });

export const jobIdSchema = z.object({ id: z.uuid() });

// Both dates are inclusive, like the calendar views that ask for them.
export const listJobsQuerySchema = z
  .object({ from: z.iso.date(), to: z.iso.date() })
  .refine((range) => range.from <= range.to, {
    message: "Must not be before from",
    path: ["to"],
  });
