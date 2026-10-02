import { expect, test } from "@playwright/test";

/**
 * Regression test for the slot-loading race: an answer for a day the visitor
 * has already left must never fill the grid.
 *
 * The slots API is replaced. Once armed, the first request (day A) is held
 * back and answers 09:00; the next (day B) answers 15:00 at once. Day B's
 * answer arrives first, so the grid must still show 15:00 after day A's
 * finally lands.
 */
test("a slow answer for the previous day never replaces the current day's slots", async ({
  page,
}) => {
  let armed = false;
  let slowSent = false;
  let slowHandled!: () => void;
  const slowDone = new Promise<void>((resolve) => {
    slowHandled = resolve;
  });

  await page.route("**/api/r/*/slots?*", async (route) => {
    const date = new URL(route.request().url()).searchParams.get("date");
    // Istanbul is UTC+3: 07:00Z reads 10:00, 06:00Z 09:00, 12:00Z 15:00.
    const answer = (hourUtc: string) => ({
      json: {
        slots: [{ time: `${date}T${hourUtc}:00:00.000Z`, taken: false }],
      },
    });
    if (!armed) return route.fulfill(answer("07"));
    if (!slowSent) {
      slowSent = true;
      await new Promise((resolve) => setTimeout(resolve, 1500));
      // With the fix the page has aborted this request, and fulfilling it
      // throws; either way the answer is offered.
      await route.fulfill(answer("06")).catch(() => {});
      slowHandled();
      return;
    }
    return route.fulfill(answer("12"));
  });

  await page.goto("/r/demo-ucretsiz");
  await page.getByRole("button", { name: /Saç Kesimi/ }).click();

  const grid = page.getByRole("radiogroup", { name: "Saat seçin" });
  await expect(grid.getByRole("radio", { name: "10:00" })).toBeVisible();

  // Positions of the open days, taken once so clicking cannot shift them.
  // The first is the day selected on arrival; A and B are the next two.
  const days = page
    .getByRole("radiogroup", { name: "Gün seçin" })
    .getByRole("radio");
  const open: number[] = [];
  for (let i = 0; i < (await days.count()); i++) {
    if (await days.nth(i).isEnabled()) open.push(i);
  }
  expect(open.length).toBeGreaterThanOrEqual(3);

  armed = true;
  await days.nth(open[1]).click(); // day A — its answer is held back
  await days.nth(open[2]).click(); // day B — answered at once

  await expect(grid.getByRole("radio", { name: "15:00" })).toBeVisible();
  await slowDone;
  // Give a late answer the moment it would need to reach the grid.
  await page.waitForTimeout(500);
  await expect(grid.getByRole("radio", { name: "09:00" })).toHaveCount(0);
  await expect(grid.getByRole("radio", { name: "15:00" })).toBeVisible();
});
