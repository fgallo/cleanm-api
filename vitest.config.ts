import { defineConfig } from "vitest/config";

// Tests get their own database and never the DATABASE_URL of .env.
const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://localhost:5432/cleanm_test";

export default defineConfig({
  test: {
    env: { DATABASE_URL: databaseUrl },
    globalSetup: "./test/global-setup.ts",
  },
});
