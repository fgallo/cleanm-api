import { z } from "zod";

const name = z.string().trim().min(1).max(200);
// Free text: phone formats vary by country.
const phone = z.string().trim().min(1).max(50).nullable();

// What the helper is usually paid for an hour of work; null when not set.
const hourlyRateCents = z.int().min(0).nullable();

export const createHelperSchema = z.object({
  name,
  phone: phone.optional(),
  hourlyRateCents: hourlyRateCents.optional(),
});

// active is only changed after creation: a new helper is always active.
export const updateHelperSchema = createHelperSchema
  .extend({ active: z.boolean() })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "At least one field is required",
  });

export const helperIdSchema = z.object({ id: z.uuid() });
