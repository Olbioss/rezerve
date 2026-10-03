import { expect, type Page, test } from "@playwright/test";

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

const days = (page: Page) =>
  page.getByRole("radiogroup", { name: "Gün seçin" }).getByRole("radio");
const grid = (page: Page) =>
  page.getByRole("radiogroup", { name: "Saat seçin" });

/** Shows a day's slots, waiting for its own answer rather than the last day's. */
async function showDay(page: Page, index: number) {
  const day = days(page).nth(index);
  // The day selected on arrival has already loaded; clicking it again would
  // send nothing to wait for.
  if ((await day.getAttribute("aria-checked")) !== "true") {
    await Promise.all([
      page.waitForResponse(/\/api\/r\/[^/]+\/slots\?/),
      day.click(),
    ]);
  }
  await expect(
    grid(page).or(page.getByText("Bu günde boş saat yok."))
  ).toBeVisible();
}

/**
 * Books the first free time on the free demo and returns where it was. Today
 * may be over, or every time left in it taken, so it walks forward to a day
 * with room.
 */
async function bookFirstFreeSlot(page: Page, email: string) {
  await page.goto("/r/demo-ucretsiz");
  await page.getByRole("button", { name: /Saç Kesimi/ }).click();

  const freeSlot = grid(page).getByRole("radio", { disabled: false }).first();
  let picked: { dayIndex: number; time: string } | null = null;
  const dayCount = await days(page).count();
  for (let i = 0; i < dayCount && !picked; i++) {
    if (await days(page).nth(i).isDisabled()) continue;
    await showDay(page, i);
    if ((await freeSlot.count()) > 0) {
      picked = { dayIndex: i, time: (await freeSlot.textContent()) ?? "" };
      await freeSlot.click();
    }
  }
  expect(picked, "some open day in the window has a free time").not.toBeNull();

  await page.getByRole("button", { name: /^Devam/ }).click();
  await page.getByLabel("Adınız").fill("Uçtan Uca Ziyaretçi");
  await page.getByLabel("E-posta").fill(email);
  await page.getByRole("button", { name: "Randevuyu onayla" }).click();

  await expect(page).toHaveURL(/\/r\/demo-ucretsiz\/onay\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("heading", { name: "Randevunuz alındı." })
  ).toBeVisible();
  return picked as { dayIndex: number; time: string };
}

test("a visitor books on the free demo and lands on the confirmation", async ({
  page,
}) => {
  await bookFirstFreeSlot(page, `e2e+${visitor}@example.com`);

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

test("a customer cancels their own booking, and the slot opens again", async ({
  page,
}) => {
  const { dayIndex, time } = await bookFirstFreeSlot(
    page,
    `e2e-iptal+${visitor}@example.com`
  );

  await page.getByRole("button", { name: "Randevuyu iptal et" }).click();
  const dialog = page.getByRole("dialog");
  // The free demo takes no kapora, so there is nothing to refund or keep.
  await expect(dialog).toContainText("Saat başkasına açılacak.");
  await dialog.getByRole("button", { name: "Evet, iptal et" }).click();
  await expect(
    page.getByRole("heading", { name: "Randevunuzu iptal ettiniz." })
  ).toBeVisible();

  // The next visitor can have that time.
  await page.goto("/r/demo-ucretsiz");
  await page.getByRole("button", { name: /Saç Kesimi/ }).click();
  await showDay(page, dayIndex);
  await expect(
    grid(page).getByRole("radio", { name: time, exact: true })
  ).toBeEnabled();
});

test("there is no calendar file for a booking that does not exist", async ({
  request,
}) => {
  const response = await request.get(
    "/r/demo-ucretsiz/onay/00000000-0000-4000-8000-000000000000/takvim"
  );
  expect(response.status()).toBe(404);
});
