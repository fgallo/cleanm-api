import { defineConfig } from "vitest/config";

// Tests get their own database and never the DATABASE_URL of .env.
const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://localhost:5432/cleanm_test";

export default defineConfig({
  test: {
    env: {
      DATABASE_URL: databaseUrl,
      // For the CORS tests: one allowed origin.
      WEB_ORIGINS: "http://localhost:5173",
      // For the trust proxy test: one proxy in front, as on the hosts.
      TRUST_PROXY: "1",
      // The request log would bury the test output; log.test.ts uses its
      // own logger.
      LOG_LEVEL: "silent",
    },
    globalSetup: "./test/global-setup.ts",
  },
});
