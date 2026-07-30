import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      // Chromium-based mobile (Pixel) — keeps CI to a single browser download
      // while still exercising the ≤960px touch layout and bottom tabs.
      name: "mobile",
      use: { ...devices["Pixel 7"] },
    },
  ],
  ...(process.env.PLAYWRIGHT_BASE_URL
    ? {}
    : {
        webServer: {
          command: `npm run build && npm run start -- -p ${PORT}`,
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 240_000,
        },
      }),
});
