import { z } from "zod";

const name = z.string().trim().min(1).max(200);
const email = z.email().max(320).nullable();
// Free text: phone formats vary by country.
const phone = z.string().trim().min(1).max(50).nullable();

export const createClientSchema = z.object({
  name,
  email: email.optional(),
  phone: phone.optional(),
});

export const updateClientSchema = createClientSchema
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "At least one field is required",
  });

export const clientIdSchema = z.object({ id: z.uuid() });
