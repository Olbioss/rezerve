import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end suite: the production build, served locally, driven by Chromium.
 *
 * The tests book appointments and the seed resets the demo businesses, and
 * .env holds the production database. So this refuses to start unless
 * DATABASE_URL — which the server below inherits — points at this machine.
 */
const databaseUrl = process.env.DATABASE_URL ?? "";
let databaseHost = "";
try {
  databaseHost = new URL(databaseUrl).hostname;
} catch {}
if (!["localhost", "127.0.0.1", "[::1]"].includes(databaseHost)) {
  throw new Error(
    `E2E runs only against a local database, and DATABASE_URL points at "${databaseHost || "nothing"}". ` +
      "Use DATABASE_URL=postgresql://<user>@localhost:5432/rezerve_e2e."
  );
}

// Its own port, never reusing a server already running: on 3000 that is
// usually `next dev`, which reads .env and so the production database.
const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "e2e",
  // One database for every test, and bookings change what the next test
  // sees, so files run one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    baseURL,
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `bunx next start -p ${PORT}`,
    url: `${baseURL}/giris`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...(process.env as Record<string, string>),
      // Better Auth checks the request origin against its base URL.
      BETTER_AUTH_URL: baseURL,
      // A local run reads the real Brevo settings from .env; test bookings
      // must not reach anyone's inbox.
      EMAIL_DELIVERY: "off",
    },
  },
});
