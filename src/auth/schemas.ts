import { z } from "zod";

// Length only (OWASP): composition rules push people to weaker passwords.
// Used wherever a password is set; sign-in accepts anything and lets the
// hash decide.
export const passwordSchema = z.string().min(8).max(1024);

export const loginSchema = z.object({
  email: z.email().max(320),
  password: z.string().min(1).max(1024),
});
