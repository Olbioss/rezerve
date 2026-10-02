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

// The booking page streams, so the move is followed in the browser rather
// than with an HTTP redirect.
test("an address the business moved away from still leads to it", async ({
  page,
}) => {
  await page.goto(`/r/${OLD}`);
  await expect(page).toHaveURL(/\/r\/demo-ucretsiz$/);
  await expect(
    page.getByRole("heading", { name: "Rezerve Demo Berber" })
  ).toBeVisible();
});

test("so does a confirmation link sent before the move", async ({ page }) => {
  await page.goto(`/r/${OLD}/onay/${BOOKING}`);
  await expect(page).toHaveURL(new RegExp(`/r/demo-ucretsiz/onay/${BOOKING}$`));
});

test("and a shared old link previews as the business it leads to", async ({
  request,
}) => {
  // Link previewers read the tags and never run the browser-side redirect.
  const html = await (
    await request.get(`/r/${OLD}`, {
      headers: { "User-Agent": "WhatsApp/2.24.1 A" },
    })
  ).text();
  expect(html).toContain(
    '<meta property="og:title" content="Rezerve Demo Berber — Randevu"/>'
  );
  expect(html).toContain(`/r/${OLD}/opengraph-image`);
  const card = await request.get(`/r/${OLD}/opengraph-image`);
  expect(card.status()).toBe(200);
  expect(card.headers()["content-type"]).toBe("image/png");
});
