import { z } from "zod";

import { jobStatuses, serviceTypes } from "./repository.ts";

const cents = z.int().min(0);
const notes = z.string().trim().min(1).max(2000).nullable();

// The helpers who do the job. In an update, the list replaces the one the
// job had, so an empty list leaves nobody assigned.
const helpers = z
  .array(
    z.object({
      helperId: z.uuid(),
      // What this helper is paid for an hour of this job when it is not
      // their usual rate; null means the usual rate.
      hourlyRateCents: cents.nullable().optional(),
    }),
  )
  .max(20)
  .refine(
    (list) => new Set(list.map((item) => item.helperId)).size === list.length,
    { message: "A helper can be listed only once" },
  );

// What a job and a recurring series (the template of its jobs) have in common.
export const jobTemplate = {
  startTime: z.iso.time(),
  // The hours of cleaning, whoever does them: how long the job takes at the
  // house follows from who is on it.
  durationMinutes: z
    .int()
    .positive()
    .max(24 * 60),
  serviceType: z.enum(serviceTypes),
  hourlyRateCents: cents,
  // null means the price is hourly rate x duration.
  fixedPriceCents: cents.nullable().optional(),
  helpers: helpers.optional(),
  // Whether the owner of the business works on the job; true when not sent.
  ownerWorks: z.boolean().optional(),
  notes: notes.optional(),
};

export const createJobSchema = z.object({
  propertyId: z.uuid(),
  scheduledDate: z.iso.date(),
  status: z.enum(jobStatuses).optional(),
  ...jobTemplate,
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
