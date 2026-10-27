import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3200);

/** End-to-end tests run against a dev server with a fresh in-memory database and the demo content. */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", ...devices["Desktop Chrome"] },
  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: "pglite://memory",
      ADMIN_USER: "e2e-admin",
      ADMIN_PASSWORD: "e2e-password-1",
      ADMIN_NAME: "E2E Admin",
      SEED_DEMO: "true",
      UPLOAD_DIR: "./.data/e2e-uploads",
    },
  },
});
