import { expect, test } from "@playwright/test";

test("a demo account fills the login form and signs in to the panel", async ({
  page,
}) => {
  await page.goto("/giris");

  await page
    .getByRole("region", { name: "Demo hesapları" })
    .getByRole("button", { name: /demo@rezerve\.app/ })
    .click();
  await expect(page.getByLabel("E-posta")).toHaveValue("demo@rezerve.app");
  await expect(page.getByLabel("Şifre")).toHaveValue("rezerve-demo");

  await page.getByRole("button", { name: "Giriş yap" }).click();
  await expect(page).toHaveURL(/\/panel$/);
  await expect(
    page.getByRole("heading", { name: /Hoş geldiniz/ })
  ).toBeVisible();
});

test("the landing page shows the demo logins to a signed-out visitor", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Paneli deneyin")).toBeVisible();
  await expect(page.getByText("demo@rezerve.app")).toBeVisible();
  await expect(page.getByText("ucretsiz@rezerve.app")).toBeVisible();
});
