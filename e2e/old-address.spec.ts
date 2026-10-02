import { expect, test } from "@playwright/test";
import { Client } from "pg";

/**
 * An address the free demo "moved away from", written straight into the
 * history table — the moving itself is covered by the integration tests.
 * playwright.config.ts has already refused anything but a local database.
 */
const OLD = "eski-demo-adresi";
const BOOKING = "00000000-0000-4000-8000-000000000000";

test.beforeAll(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  await db.query(
    `insert into organization_slug_history (slug, organization_id)
     values ($1, 'org_rezerve_demo_free') on conflict do nothing`,
    [OLD]
  );
  await db.end();
});

test.afterAll(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  await db.query("delete from organization_slug_history where slug = $1", [
    OLD,
  ]);
  await db.end();
});

test("an address the business moved away from still leads to it", async ({
  request,
}) => {
  const response = await request.get(`/r/${OLD}`, { maxRedirects: 0 });
  // Temporary: the business may move back to it.
  expect(response.status()).toBe(307);
  expect(response.headers().location).toMatch(/\/r\/demo-ucretsiz$/);
});

test("so does a confirmation link sent before the move", async ({
  request,
}) => {
  const response = await request.get(`/r/${OLD}/onay/${BOOKING}`, {
    maxRedirects: 0,
  });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toMatch(
    new RegExp(`/r/demo-ucretsiz/onay/${BOOKING}$`)
  );
});
