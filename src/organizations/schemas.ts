import { z } from "zod";

const text = (max: number) => z.string().trim().min(1).max(max);

// The same list PostgreSQL checks with is_timezone(); both follow the IANA
// database, so a name accepted here is accepted there.
const timezones = new Set(Intl.supportedValuesOf("timeZone"));

export const updateOrganizationSchema = z
  .object({
    name: text(200),
    timezone: z
      .string()
      .refine((zone) => timezones.has(zone), "Must be an IANA time zone"),
    addressLine1: text(200).nullable(),
    addressLine2: text(200).nullable(),
    city: text(100).nullable(),
    province: text(100).nullable(),
    postalCode: text(20).nullable(),
    // ISO 3166-1 alpha-2, such as CA or US.
    country: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/, "Must be a two-letter country code"),
    phone: text(50).nullable(),
    email: z.email().max(320).nullable(),
    // Free text, printed as it is: "www.example.com" is what an invoice
    // shows, and a URL check would refuse it.
    website: text(200).nullable(),
    paymentInstructions: text(2000).nullable(),
    taxName: text(50).nullable(),
    // 1300 means 13.00%.
    taxRateBasisPoints: z.int().min(0).max(10000),
    taxRegistrationNumber: text(50).nullable(),
    // Must also be above every invoice number already used: the route
    // checks that against the database.
    nextInvoiceNumber: z.int().positive(),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "At least one field is required",
  });
