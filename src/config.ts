import { integerEnv } from "./env.ts";

// Server configuration. The database reads its own DATABASE_URL in
// src/db/pool.ts, so scripts like db:migrate do not depend on this.
export const config = {
  port: integerEnv("PORT", 3000),
  // Turns on what only makes sense behind HTTPS, such as Secure cookies.
  production: process.env.NODE_ENV === "production",
  // Number of proxies in front of the API (1 on Railway, Render and Fly.io).
  // The client address is then read from X-Forwarded-For, so rate limiting
  // counts real addresses instead of the proxy's. 0 trusts no proxy, so a
  // client cannot forge the header.
  trustProxy: integerEnv("TRUST_PROXY", 0),
  // Chromium's sandbox needs unprivileged user namespaces, which Ubuntu
  // 23.10+ and most containers block. Set to "true" on such hosts; the pages
  // rendered are the API's own HTML, so the sandbox is a second line, not
  // the first.
  chromiumNoSandbox: process.env.CHROMIUM_NO_SANDBOX === "true",
  // Browser origins allowed to call the API with the session cookie, comma
  // separated (the web client). Empty means none: native apps need no CORS.
  webOrigins: (process.env.WEB_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin !== ""),
};
