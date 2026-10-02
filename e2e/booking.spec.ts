import { expect, test } from "@playwright/test";

test("a visitor books on the free demo and lands on the confirmation", async ({
  page,
}) => {
  await page.goto("/r/demo-ucretsiz");
  await page.getByRole("button", { name: /Saç Kesimi/ }).click();

  const days = page
    .getByRole("radiogroup", { name: "Gün seçin" })
    .getByRole("radio");
  const freeSlot = page
    .getByRole("radiogroup", { name: "Saat seçin" })
    .getByRole("radio", { disabled: false })
    .first();
  const noSlots = page.getByText("Bu günde boş saat yok.");

  // Today may be over or fully booked, so walk forward to a day with room.
  let picked = false;
  const dayCount = await days.count();
  for (let i = 0; i < dayCount && !picked; i++) {
    const day = days.nth(i);
    if (await day.isDisabled()) continue;
    await day.click();
    await expect(freeSlot.or(noSlots)).toBeVisible();
    if (await freeSlot.isVisible()) {
      await freeSlot.click();
      picked = true;
    }
  }
  expect(picked, "some open day in the window has a free time").toBe(true);

  await page.getByRole("button", { name: /^Devam/ }).click();
  await page.getByLabel("Adınız").fill("Uçtan Uca Ziyaretçi");
  await page.getByLabel("E-posta").fill("e2e@example.com");
  await page.getByRole("button", { name: "Randevuyu onayla" }).click();

  await expect(page).toHaveURL(/\/r\/demo-ucretsiz\/onay\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("heading", { name: "Randevunuz alındı." })
  ).toBeVisible();
});
