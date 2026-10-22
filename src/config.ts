import { integerEnv } from "./env.ts";

// Server configuration. The database reads its own DATABASE_URL in
// src/db/pool.ts, so scripts like db:migrate do not depend on this.
export const config = {
  port: integerEnv("PORT", 3000),
  // Turns on what only makes sense behind HTTPS, such as Secure cookies.
  production: process.env.NODE_ENV === "production",
  // Chromium's sandbox needs unprivileged user namespaces, which Ubuntu
  // 23.10+ and most containers block. Set to "true" on such hosts; the pages
  // rendered are the API's own HTML, so the sandbox is a second line, not
  // the first.
  chromiumNoSandbox: process.env.CHROMIUM_NO_SANDBOX === "true",
};
