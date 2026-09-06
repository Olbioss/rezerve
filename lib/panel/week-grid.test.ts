import { describe, expect, it } from "vitest";
import type { AvailabilityInterval } from "@/lib/booking/slots";
import {
  buildWeekGrid,
  type GridBooking,
  type WeekGridInput,
  windowDayISOs,
} from "./week-grid";

const IST = "Europe/Istanbul"; // UTC+3 year-round
const NY = "America/New_York";

/** Mon–Sat 10:00–18:00, closed Sunday. */
const WEEKDAYS: AvailabilityInterval[] = [1, 2, 3, 4, 5, 6].map((weekday) => ({
  weekday,
  startMinutes: 10 * 60,
  endMinutes: 18 * 60,
}));

function grid(overrides: Partial<WeekGridInput> = {}) {
  return buildWeekGrid({
    // Wednesday 9 Sep 2026, midday UTC.
    now: new Date("2026-09-09T12:00:00Z"),
    timezone: IST,
    rules: WEEKDAYS,
    bookings: [],
    ...overrides,
  });
}

function booking(
  startsAt: string,
  endsAt: string,
  status: GridBooking["status"] = "confirmed"
): GridBooking {
  return { startsAt: new Date(startsAt), endsAt: new Date(endsAt), status };
}

describe("windowDayISOs", () => {
  it("starts today and runs seven days forward", () => {
    expect(windowDayISOs(new Date("2026-09-09T12:00:00Z"), IST)).toEqual([
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
      "2026-09-13",
      "2026-09-14",
      "2026-09-15",
    ]);
  });

  it("keeps tomorrow in view on the last day of a calendar week", () => {
    // The bug this replaced: on Sunday 6 Sep a Mon–Sun grid showed
    // 31 Aug–6 Sep, so Monday's confirmed booking fell outside it while
    // the stat tiles beside it counted that same booking.
    const days = windowDayISOs(new Date("2026-09-06T12:00:00Z"), IST);
    expect(days[0]).toBe("2026-09-06");
    expect(days).toContain("2026-09-07");
  });

  it("uses the business timezone, not UTC, to decide the day", () => {
    // 22:30Z Sunday is already Monday 01:30 in Istanbul.
    const days = windowDayISOs(new Date("2026-09-06T22:30:00Z"), IST);
    expect(days[0]).toBe("2026-09-07");
  });
});

describe("buildWeekGrid columns", () => {
  it("maps each rolling column onto its own weekday's rules", () => {
    // now is Wednesday 9 Sep, so the columns run ÇAR..SAL and the only
    // closed one is Sunday 13 Sep — column index 4.
    const week = grid();
    const closedColumns = week.days
      .map((_, i) => i)
      .filter((i) => week.cells.every((row) => row[i] === "closed"));
    expect(closedColumns).toEqual([4]);
    expect(week.days[0].weekday).toBe("ÇAR");
    expect(week.days[4].weekday).toBe("PAZ");
  });

  it("closes a single day exactly where its rule is missing", () => {
    // Drop Friday (weekday 5). From Wednesday, Friday is column index 2.
    const week = grid({ rules: WEEKDAYS.filter((r) => r.weekday !== 5) });
    expect(week.days[2].weekday).toBe("CUM");
    expect(week.cells.every((row) => row[2] === "closed")).toBe(true);
    expect(week.cells[0][1]).not.toBe("closed");
    expect(week.cells[0][3]).not.toBe("closed");
  });

  it("leaves a split-shift gap closed between the two shifts", () => {
    // Wednesday = weekday 3, which is column 0 from a Wednesday "now".
    const week = grid({
      rules: [
        { weekday: 3, startMinutes: 10 * 60, endMinutes: 13 * 60 },
        { weekday: 3, startMinutes: 14 * 60, endMinutes: 18 * 60 },
      ],
    });
    const row = (hour: number) => week.cells[week.hours.indexOf(hour)][0];
    expect(row(12)).toBe("free");
    expect(row(13)).toBe("closed");
    expect(row(14)).toBe("free");
  });
});

describe("buildWeekGrid bookings", () => {
  // "now" is Wednesday 9 Sep, so the columns run:
  //   0 ÇAR 9 · 1 PER 10 · 2 CUM 11 · 3 CMT 12 · 4 PAZ 13 · 5 PZT 14 · 6 SAL 15
  it("places a booking in its local day column and hour rows", () => {
    // 07:30Z–08:30Z = 10:30–11:30 Istanbul, on Wednesday 9 Sep.
    const week = grid({
      bookings: [booking("2026-09-09T07:30:00Z", "2026-09-09T08:30:00Z")],
    });
    const at = (hour: number, day: number) =>
      week.cells[week.hours.indexOf(hour)][day];
    // Spans both hours it actually touches, and only its own column.
    expect(at(10, 0)).toBe("confirmed");
    expect(at(11, 0)).toBe("confirmed");
    expect(at(12, 0)).toBe("free");
    expect(at(10, 1)).toBe("free");
  });

  it("drops a booking that falls outside the seven-day window", () => {
    // Two days before "now" — it belongs to the past, not this grid.
    const week = grid({
      bookings: [booking("2026-09-07T07:30:00Z", "2026-09-07T08:30:00Z")],
    });
    expect(week.cells.flat()).not.toContain("confirmed");
  });

  it("buckets by business-local time, not UTC", () => {
    // One instant, two businesses: 22:00Z Wednesday is 18:00 Wednesday in
    // New York but 01:00 *Thursday* in Istanbul. The same booking must land
    // in different columns depending on whose week it is.
    const late = booking("2026-09-09T22:00:00Z", "2026-09-09T23:00:00Z");
    const hours = (from: number, to: number) =>
      [3, 4].map((weekday) => ({
        weekday,
        startMinutes: from * 60,
        endMinutes: to * 60,
      }));

    const ny = buildWeekGrid({
      now: new Date("2026-09-09T12:00:00Z"),
      timezone: NY,
      rules: hours(10, 20),
      bookings: [late],
    });
    // Wednesday column, 18:00 row.
    expect(ny.days[0].dateISO).toBe("2026-09-09");
    expect(ny.cells[ny.hours.indexOf(18)][0]).toBe("confirmed");
    expect(ny.cells[ny.hours.indexOf(18)][1]).toBe("free");

    const ist = buildWeekGrid({
      now: new Date("2026-09-09T12:00:00Z"),
      timezone: IST,
      rules: hours(0, 6),
      bookings: [late],
    });
    // Thursday column, 01:00 row — the very same instant.
    expect(ist.cells[ist.hours.indexOf(1)][1]).toBe("confirmed");
    expect(ist.cells[ist.hours.indexOf(1)][0]).toBe("free");
  });

  it("lets confirmed win over pending in the same hour", () => {
    const week = grid({
      bookings: [
        booking("2026-09-09T07:00:00Z", "2026-09-09T08:00:00Z", "pending"),
        booking("2026-09-09T07:00:00Z", "2026-09-09T08:00:00Z", "confirmed"),
      ],
    });
    expect(week.cells[week.hours.indexOf(10)][0]).toBe("confirmed");
  });

  it("shows a lone pending booking as pending", () => {
    const week = grid({
      bookings: [
        booking("2026-09-09T07:00:00Z", "2026-09-09T08:00:00Z", "pending"),
      ],
    });
    expect(week.cells[week.hours.indexOf(10)][0]).toBe("pending");
  });

  it("ignores cancelled bookings entirely", () => {
    const week = grid({
      bookings: [
        booking("2026-09-09T07:00:00Z", "2026-09-09T08:00:00Z", "cancelled"),
      ],
    });
    expect(week.cells[week.hours.indexOf(10)][0]).toBe("free");
    expect(week.occupancyPercent).toBe(0);
  });

  it("never paints over a closed hour", () => {
    // 05:00Z = 08:00 Istanbul, two hours before opening.
    const week = grid({
      bookings: [booking("2026-09-09T05:00:00Z", "2026-09-09T06:00:00Z")],
    });
    expect(week.hours).not.toContain(8);
    expect(week.cells[week.hours.indexOf(10)][0]).toBe("free");
  });
});

describe("buildWeekGrid rows", () => {
  it("derives the hour range from the opening hours", () => {
    const week = grid({
      rules: [{ weekday: 1, startMinutes: 12 * 60, endMinutes: 21 * 60 }],
    });
    expect(week.hours[0]).toBe(12);
    expect(week.hours.at(-1)).toBe(20);
  });

  it("caps a 24-hour business at 16 rows", () => {
    const week = grid({
      rules: [{ weekday: 1, startMinutes: 0, endMinutes: 24 * 60 }],
    });
    expect(week.hours).toHaveLength(16);
  });

  it("falls back to a daytime range when no hours are set", () => {
    const week = grid({ rules: [] });
    expect(week.hours[0]).toBe(9);
    expect(week.cells.every((row) => row.every((c) => c === "closed"))).toBe(
      true
    );
  });
});

describe("buildWeekGrid occupancy", () => {
  it("divides booked minutes by the week's open minutes", () => {
    // 6 days × 8h = 48 open hours; one 1-hour booking = 2%.
    const week = grid({
      bookings: [booking("2026-09-09T07:30:00Z", "2026-09-09T08:30:00Z")],
    });
    expect(week.openHours).toBe(48);
    expect(week.bookedHours).toBe(1);
    expect(week.occupancyPercent).toBe(2);
  });

  it("counts only confirmed bookings toward occupancy", () => {
    const week = grid({
      bookings: [
        booking("2026-09-09T07:00:00Z", "2026-09-09T08:00:00Z", "pending"),
      ],
    });
    expect(week.occupancyPercent).toBe(0);
  });

  it("returns null rather than NaN when no hours are set", () => {
    const week = grid({ rules: [] });
    expect(week.occupancyPercent).toBeNull();
    expect(week.openHours).toBe(0);
  });
});
