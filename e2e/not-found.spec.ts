import { expect, test } from "@playwright/test";

test("an unknown address is a Turkish 404", async ({ page }) => {
  const response = await page.goto("/boyle-bir-sayfa-yok");
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "Bu sayfa bulunamadı." })
  ).toBeVisible();
});

// A booking page streams its business in, so by the time one turns out not
// to exist the response has already started as a 200. Next marks it noindex
// instead; the visitor sees the same page either way.
const softNotFound = async (
  page: import("@playwright/test").Page,
  path: string
) => {
  await page.goto(path);
  await expect(
    page.getByRole("heading", { name: "Bu randevu sayfası bulunamadı." })
  ).toBeVisible();
  // Once in the head, once where the stream learned it: either will do.
  await expect(
    page.locator('meta[name="robots"][content*="noindex"]').first()
  ).toBeAttached();
};

test("an unknown business blames the address, and is kept out of search", async ({
  page,
}) => {
  await softNotFound(page, "/r/boyle-bir-isletme-yok");
});

test("a confirmation link cut short says so, instead of failing", async ({
  page,
}) => {
  await softNotFound(page, "/r/demo/onay/1234-kesik");
});
