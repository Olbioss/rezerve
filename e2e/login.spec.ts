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

  // Signed in now. The landing page's static shell is the signed-out page;
  // the parts that differ stream in for this session.
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Panele git" })).toBeVisible();
  await expect(page.getByText("Paneli deneyin")).toHaveCount(0);

  // And the login page, whose form is static, sends them back to the panel.
  await page.goto("/giris");
  await expect(page).toHaveURL(/\/panel$/);
});

test("the landing page shows the demo logins to a signed-out visitor", async ({
  page,
}) => {
  await page.goto("/");
  // Scoped to <main>: the streamed copy of a boundary waits, hidden, at the
  // end of <body> for a moment before React swaps it in.
  const main = page.getByRole("main");
  await expect(main.getByText("Paneli deneyin")).toBeVisible();
  await expect(main.getByText("demo@rezerve.app")).toBeVisible();
  await expect(main.getByText("ucretsiz@rezerve.app")).toBeVisible();
});
