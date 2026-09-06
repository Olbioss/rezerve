import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WeekHeatmap } from "@/components/panel/week-heatmap";
import type { AvailabilityInterval } from "@/lib/booking/slots";
import { buildWeekGrid, type GridBooking } from "./week-grid";

const IST = "Europe/Istanbul";
const WEEKDAYS: AvailabilityInterval[] = [1, 2, 3, 4, 5, 6].map((weekday) => ({
  weekday,
  startMinutes: 10 * 60,
  endMinutes: 18 * 60,
}));

function markup(
  rules: AvailabilityInterval[] = WEEKDAYS,
  bookings: GridBooking[] = []
) {
  const week = buildWeekGrid({
    now: new Date("2026-09-09T12:00:00Z"),
    timezone: IST,
    rules,
    bookings,
  });
  return renderToStaticMarkup(createElement(WeekHeatmap, { week }));
}

describe("WeekHeatmap", () => {
  it("renders one cell per hour per day, plus the header row", () => {
    const html = markup();
    // 8 hour rows × 7 days = 56 cells; day headers and hour labels are spans
    // without the rounded cell class.
    const cells = html.match(/rounded-\[4px\]/g) ?? [];
    expect(cells).toHaveLength(56);
  });

  it("labels the columns Monday-first in Turkish", () => {
    const html = markup();
    const order = ["PZT", "SAL", "ÇAR", "PER", "CUM", "CMT", "PAZ"];
    let cursor = -1;
    for (const day of order) {
      const at = html.indexOf(day, cursor + 1);
      expect(at, `${day} out of order`).toBeGreaterThan(cursor);
      cursor = at;
    }
  });

  it("paints a confirmed booking with the primary fill", () => {
    const html = markup(WEEKDAYS, [
      {
        startsAt: new Date("2026-09-07T07:30:00Z"),
        endsAt: new Date("2026-09-07T08:30:00Z"),
        status: "confirmed",
      },
    ]);
    expect(html).toContain("bg-primary");
  });

  it("uses no green or red anywhere", () => {
    // The artifact's hardest rule: the panel never looks like an alarm.
    const html = markup(WEEKDAYS, [
      {
        startsAt: new Date("2026-09-07T07:30:00Z"),
        endsAt: new Date("2026-09-07T08:30:00Z"),
        status: "pending",
      },
    ]).toLowerCase();
    for (const banned of ["green", "red", "destructive", "emerald", "rose"]) {
      expect(html, `found ${banned}`).not.toContain(banned);
    }
  });

  it("renders the legend and the date range", () => {
    const html = markup();
    for (const label of ["Onaylı", "Bekliyor", "Boş", "Bu hafta"]) {
      expect(html).toContain(label);
    }
    expect(html).toMatch(/7–13 Eyl/);
  });

  it("survives a business with no opening hours", () => {
    const html = markup([]);
    expect(html).toContain("rounded-[4px]");
    expect(html).not.toContain("NaN");
  });

  it("keeps the grid inside its own scroll container", () => {
    // The heatmap is wide content; it must scroll itself, never the page.
    expect(markup()).toContain("overflow-x-auto");
  });
});
