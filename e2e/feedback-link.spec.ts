import { expect, test } from "@playwright/test";

const BOARD = "https://pano.olbios88.workers.dev/rezerve";

test("the panel links to the owners' feedback board, in a new tab", async ({
  page,
  context,
}) => {
  // The board is another app, on Pano; the test never reaches it.
  await context.route(`${BOARD}**`, (route) =>
    route.fulfill({ contentType: "text/html", body: "<title>Pano</title>" })
  );

  // One sign-in for both widths: the login endpoint allows three in ten
  // seconds, and the demo login test signs in too.
  await page.goto("/giris");
  await page.getByLabel("E-posta").fill("demo@rezerve.app");
  await page.getByLabel("Şifre").fill("rezerve-demo");
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await expect(page).toHaveURL(/\/panel$/);

  // On a desktop it has its own section at the foot of the sidebar.
  const link = page.getByRole("link", { name: "Geri bildirim" });
  await expect(link).toHaveAttribute("href", BOARD);
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  await expect(
    page.getByRole("navigation").getByRole("link", { name: "Geri bildirim" })
  ).toHaveCount(0);

  const [board] = await Promise.all([
    context.waitForEvent("page"),
    link.click(),
  ]);
  await expect(board).toHaveURL(BOARD);
  // noopener: the board's tab has no handle on the panel.
  expect(await board.evaluate(() => window.opener)).toBeNull();
  await board.close();

  // On a phone that footer is hidden, and the link ends the nav's row.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(link).toHaveCount(1);
  const inNav = page
    .getByRole("navigation")
    .getByRole("link", { name: "Geri bildirim" });
  await expect(inNav).toHaveAttribute("href", BOARD);
  await expect(inNav).toHaveAttribute("target", "_blank");
  await expect(inNav).toHaveAttribute("rel", "noopener noreferrer");
});
