import { expect, test } from "@playwright/test";

test("an unknown address is a Turkish 404", async ({ page }) => {
  const response = await page.goto("/boyle-bir-sayfa-yok");
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "Bu sayfa bulunamadı." })
  ).toBeVisible();
});

test("an unknown business is a 404 that blames the address", async ({
  page,
}) => {
  const response = await page.goto("/r/boyle-bir-isletme-yok");
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "Bu randevu sayfası bulunamadı." })
  ).toBeVisible();
});

test("a confirmation link cut short is a 404, not a server error", async ({
  page,
}) => {
  const response = await page.goto("/r/demo/onay/1234-kesik");
  expect(response?.status()).toBe(404);
});
