import { expect, test } from "@playwright/test";

// Every run is a new visitor. The booking form allows three bookings an hour
// per email and six per address (lib/booking/throttle.ts), and repeated local
// runs against one database would otherwise run into both. The address comes
// from TEST-NET-2, a range reserved for examples.
const visitor = Date.now().toString(36);
test.use({
  extraHTTPHeaders: {
    "x-forwarded-for": `198.51.100.${1 + Math.floor(Math.random() * 254)}`,
  },
});

test("a visitor books on the free demo and lands on the confirmation", async ({
  page,
}) => {
  await page.goto("/r/demo-ucretsiz");
  await page.getByRole("button", { name: /Saç Kesimi/ }).click();

  const days = page
    .getByRole("radiogroup", { name: "Gün seçin" })
    .getByRole("radio");
  const grid = page.getByRole("radiogroup", { name: "Saat seçin" });
  const freeSlot = grid.getByRole("radio", { disabled: false }).first();
  const noSlots = page.getByText("Bu günde boş saat yok.");

  // Today may be over, or every time left in it taken, so walk forward to a
  // day with room. Each day's answer is awaited before its grid is read: the
  // previous day's grid must not be mistaken for this one.
  let picked = false;
  const dayCount = await days.count();
  for (let i = 0; i < dayCount && !picked; i++) {
    const day = days.nth(i);
    if (await day.isDisabled()) continue;
    // The day selected on arrival has already loaded; clicking it again
    // would send nothing to wait for.
    if ((await day.getAttribute("aria-checked")) !== "true") {
      await Promise.all([
        page.waitForResponse(/\/api\/r\/[^/]+\/slots\?/),
        day.click(),
      ]);
    }
    await expect(grid.or(noSlots)).toBeVisible();
    if ((await freeSlot.count()) > 0) {
      await freeSlot.click();
      picked = true;
    }
  }
  expect(picked, "some open day in the window has a free time").toBe(true);

  await page.getByRole("button", { name: /^Devam/ }).click();
  await page.getByLabel("Adınız").fill("Uçtan Uca Ziyaretçi");
  await page.getByLabel("E-posta").fill(`e2e+${visitor}@example.com`);
  await page.getByRole("button", { name: "Randevuyu onayla" }).click();

  await expect(page).toHaveURL(/\/r\/demo-ucretsiz\/onay\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("heading", { name: "Randevunuz alındı." })
  ).toBeVisible();

  // The confirmation offers the appointment to a calendar, both ways.
  await expect(
    page.getByRole("link", { name: /Google Takvim/ })
  ).toHaveAttribute(
    "href",
    /^https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE&/
  );
  const icsHref = await page
    .getByRole("link", { name: /\.ics/ })
    .getAttribute("href");
  expect(icsHref).toMatch(/\/onay\/[0-9a-f-]{36}\/takvim$/);
  const ics = await page.request.get(icsHref ?? "");
  expect(ics.status()).toBe(200);
  expect(ics.headers()["content-type"]).toContain("text/calendar");
  const body = await ics.text();
  expect(body).toContain("BEGIN:VEVENT");
  expect(body).toContain("SUMMARY:Saç Kesimi — Rezerve Demo Berber");
});

test("there is no calendar file for a booking that does not exist", async ({
  request,
}) => {
  const response = await request.get(
    "/r/demo-ucretsiz/onay/00000000-0000-4000-8000-000000000000/takvim"
  );
  expect(response.status()).toBe(404);
});
