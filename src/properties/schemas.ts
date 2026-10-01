import { z } from "zod";

const addressLine = z.string().trim().min(1).max(200);
const city = z.string().trim().min(1).max(100);
// Free text: province and postal code formats vary by country.
const province = z.string().trim().min(1).max(100);
const postalCode = z.string().trim().min(1).max(20);
// ISO 3166-1 alpha-2, such as CA or US.
const country = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, "Must be a two-letter country code");
const notes = z.string().trim().min(1).max(2000).nullable();

// No .default() on country: it would survive .partial() and overwrite the
// stored country on every PATCH. The repository applies the default.
export const createPropertySchema = z.object({
  addressLine1: addressLine,
  addressLine2: addressLine.nullable().optional(),
  city,
  province,
  postalCode,
  country: country.optional(),
  notes: notes.optional(),
});

export const updatePropertySchema = createPropertySchema
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "At least one field is required",
  });

export const propertyIdSchema = z.object({ id: z.uuid() });

export const clientPropertiesParamsSchema = z.object({ clientId: z.uuid() });
