import { expect, test } from "@playwright/test";

test("a business link previews with its own name, words and card", async ({
  page,
  request,
}) => {
  await page.goto("/r/demo");
  const meta = (property: string) =>
    page.locator(`meta[property="${property}"]`);

  await expect(meta("og:title")).toHaveAttribute(
    "content",
    "Rezerve Demo Salon — Randevu"
  );
  await expect(meta("og:description")).toHaveAttribute(
    "content",
    /örnek işletmesi/
  );

  // The card is the business's own, not the site's.
  const image = new URL((await meta("og:image").getAttribute("content")) ?? "");
  expect(image.pathname).toBe("/r/demo/opengraph-image");
  const card = await request.get(image.pathname + image.search);
  expect(card.status()).toBe(200);
  expect(card.headers()["content-type"]).toBe("image/png");
});
