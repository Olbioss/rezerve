import { describe, expect, it } from "vitest";
import type { AvailabilityInterval } from "@/lib/booking/slots";
import {
  buildWeekGrid,
  type GridBooking,
  type WeekGridInput,
  weekDayISOs,
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

describe("weekDayISOs", () => {
  it("starts the week on Monday", () => {
    // 2026-09-09 is a Wednesday.
    expect(weekDayISOs(new Date("2026-09-09T12:00:00Z"), IST)).toEqual([
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
      "2026-09-13",
    ]);
  });

  it("treats Sunday as the end of the week it closes, not the start", () => {
    // 2026-09-06 is a Sunday: it belongs to the week beginning Aug 31.
    const days = weekDayISOs(new Date("2026-09-06T12:00:00Z"), IST);
    expect(days[0]).toBe("2026-08-31");
    expect(days[6]).toBe("2026-09-06");
  });

  it("uses the business timezone, not UTC, to decide the day", () => {
    // 22:30Z Sunday is already Monday 01:30 in Istanbul, so the week rolls.
    const days = weekDayISOs(new Date("2026-09-06T22:30:00Z"), IST);
    expect(days[0]).toBe("2026-09-07");
  });
});

describe("buildWeekGrid columns", () => {
  it("maps the Monday-first columns onto the right weekday rules", () => {
    // Sunday is the only closed day, so only the last column may be closed.
    const week = grid();
    const closedColumns = week.days
      .map((_, i) => i)
      .filter((i) => week.cells.every((row) => row[i] === "closed"));
    expect(closedColumns).toEqual([6]);
    expect(week.days[6].weekday).toBe("PAZ");
    expect(week.days[0].weekday).toBe("PZT");
  });

  it("closes a single mid-week day exactly where its rule is missing", () => {
    // Drop Wednesday (weekday 3) — column index 2, Monday-first.
    const week = grid({ rules: WEEKDAYS.filter((r) => r.weekday !== 3) });
    expect(week.cells.every((row) => row[2] === "closed")).toBe(true);
    expect(week.cells[0][1]).not.toBe("closed");
    expect(week.cells[0][3]).not.toBe("closed");
  });

  it("leaves a split-shift gap closed between the two shifts", () => {
    const week = grid({
      rules: [
        { weekday: 1, startMinutes: 10 * 60, endMinutes: 13 * 60 },
        { weekday: 1, startMinutes: 14 * 60, endMinutes: 18 * 60 },
      ],
    });
    const row = (hour: number) => week.cells[week.hours.indexOf(hour)][0];
    expect(row(12)).toBe("free");
    expect(row(13)).toBe("closed");
    expect(row(14)).toBe("free");
  });
});

describe("buildWeekGrid bookings", () => {
  it("places a booking in its local day column and hour rows", () => {
    // 07:30Z–08:30Z = 10:30–11:30 Istanbul, on Monday 7 Sep.
    const week = grid({
      bookings: [booking("2026-09-07T07:30:00Z", "2026-09-07T08:30:00Z")],
    });
    const at = (hour: number, day: number) =>
      week.cells[week.hours.indexOf(hour)][day];
    // Spans both hours it actually touches, and only the Monday column.
    expect(at(10, 0)).toBe("confirmed");
    expect(at(11, 0)).toBe("confirmed");
    expect(at(12, 0)).toBe("free");
    expect(at(10, 1)).toBe("free");
  });

  it("buckets by business-local time, not UTC", () => {
    // One instant, two businesses: 22:00Z Monday is 18:00 Monday in New York
    // but 01:00 *Tuesday* in Istanbul. The same booking must land in
    // different columns depending on whose week it is.
    const late = booking("2026-09-07T22:00:00Z", "2026-09-07T23:00:00Z");
    const hours = (from: number, to: number) =>
      [1, 2].map((weekday) => ({
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
    // Monday column, 18:00 row.
    expect(ny.days[0].dateISO).toBe("2026-09-07");
    expect(ny.cells[ny.hours.indexOf(18)][0]).toBe("confirmed");
    expect(ny.cells[ny.hours.indexOf(18)][1]).toBe("free");

    const ist = buildWeekGrid({
      now: new Date("2026-09-09T12:00:00Z"),
      timezone: IST,
      rules: hours(0, 6),
      bookings: [late],
    });
    // Tuesday column, 01:00 row — the very same instant.
    expect(ist.cells[ist.hours.indexOf(1)][1]).toBe("confirmed");
    expect(ist.cells[ist.hours.indexOf(1)][0]).toBe("free");
  });

  it("lets confirmed win over pending in the same hour", () => {
    const week = grid({
      bookings: [
        booking("2026-09-07T07:00:00Z", "2026-09-07T08:00:00Z", "pending"),
        booking("2026-09-07T07:00:00Z", "2026-09-07T08:00:00Z", "confirmed"),
      ],
    });
    expect(week.cells[week.hours.indexOf(10)][0]).toBe("confirmed");
  });

  it("shows a lone pending booking as pending", () => {
    const week = grid({
      bookings: [
        booking("2026-09-07T07:00:00Z", "2026-09-07T08:00:00Z", "pending"),
      ],
    });
    expect(week.cells[week.hours.indexOf(10)][0]).toBe("pending");
  });

  it("ignores cancelled bookings entirely", () => {
    const week = grid({
      bookings: [
        booking("2026-09-07T07:00:00Z", "2026-09-07T08:00:00Z", "cancelled"),
      ],
    });
    expect(week.cells[week.hours.indexOf(10)][0]).toBe("free");
    expect(week.occupancyPercent).toBe(0);
  });

  it("never paints over a closed hour", () => {
    // 05:00Z = 08:00 Istanbul, two hours before opening.
    const week = grid({
      bookings: [booking("2026-09-07T05:00:00Z", "2026-09-07T06:00:00Z")],
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
      bookings: [booking("2026-09-07T07:30:00Z", "2026-09-07T08:30:00Z")],
    });
    expect(week.openHours).toBe(48);
    expect(week.bookedHours).toBe(1);
    expect(week.occupancyPercent).toBe(2);
  });

  it("counts only confirmed bookings toward occupancy", () => {
    const week = grid({
      bookings: [
        booking("2026-09-07T07:00:00Z", "2026-09-07T08:00:00Z", "pending"),
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
