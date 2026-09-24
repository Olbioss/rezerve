import { describe, expect, it } from "vitest";
import {
  type DateException,
  dateOverrides,
  resolveIntervalsForDate,
} from "./exceptions";
import { type AvailabilityInterval, computeSlotsForDay } from "./slots";

/** Europe/Istanbul is UTC+3 year-round. */
const IST = "Europe/Istanbul";

/** Mon–Sat 10:00–18:00, closed Sunday. */
const WEEKLY: AvailabilityInterval[] = [1, 2, 3, 4, 5, 6].map((weekday) => ({
  weekday,
  startMinutes: 10 * 60,
  endMinutes: 18 * 60,
}));

// 2026-10-28 is a Wednesday; 2026-11-01 a Sunday.
const WED = "2026-10-28";
const SUN = "2026-11-01";

const closed = (startsOn: string, endsOn = startsOn): DateException => ({
  startsOn,
  endsOn,
  intervals: [],
});

describe("resolveIntervalsForDate", () => {
  it("uses the weekly hours when no exception covers the date", () => {
    expect(resolveIntervalsForDate(WEEKLY, [], WED, IST)).toEqual([
      { weekday: 3, startMinutes: 600, endMinutes: 1080 },
    ]);
  });

  it("closes the whole day for a closure", () => {
    expect(resolveIntervalsForDate(WEEKLY, [closed(WED)], WED, IST)).toEqual(
      []
    );
  });

  it("replaces the weekly hours with one-off hours, not adds to them", () => {
    const halfDay: DateException = {
      startsOn: WED,
      endsOn: WED,
      intervals: [{ startMinutes: 600, endMinutes: 780 }],
    };
    expect(resolveIntervalsForDate(WEEKLY, [halfDay], WED, IST)).toEqual([
      { weekday: 3, startMinutes: 600, endMinutes: 780 },
    ]);
  });

  it("opens a normally closed weekday, stamped with that weekday", () => {
    // The slot engine filters on weekday, so the stamp is what makes a
    // Sunday opening produce slots at all.
    const sundayOpening: DateException = {
      startsOn: SUN,
      endsOn: SUN,
      intervals: [
        { startMinutes: 600, endMinutes: 720 },
        { startMinutes: 780, endMinutes: 900 },
      ],
    };
    expect(resolveIntervalsForDate(WEEKLY, [sundayOpening], SUN, IST)).toEqual([
      { weekday: 0, startMinutes: 600, endMinutes: 720 },
      { weekday: 0, startMinutes: 780, endMinutes: 900 },
    ]);
  });

  it("covers every day of a range, both ends included, and nothing after", () => {
    const vacation = closed("2026-10-26", "2026-10-30");
    for (const date of ["2026-10-26", WED, "2026-10-30"]) {
      expect(resolveIntervalsForDate(WEEKLY, [vacation], date, IST)).toEqual(
        []
      );
    }
    expect(
      resolveIntervalsForDate(WEEKLY, [vacation], "2026-10-31", IST)
    ).toHaveLength(1);
    expect(
      resolveIntervalsForDate(WEEKLY, [vacation], "2026-10-24", IST)
    ).toHaveLength(1);
  });

  it("feeds the slot engine: a closed date has no slots at all", () => {
    const slots = computeSlotsForDay({
      dateISO: WED,
      timezone: IST,
      rules: resolveIntervalsForDate(WEEKLY, [closed(WED)], WED, IST),
      durationMinutes: 30,
      granularityMinutes: 30,
      existingBookings: [],
      now: new Date("2026-10-01T00:00:00Z"),
      minLeadTimeMinutes: 0,
    });
    expect(slots).toEqual([]);
  });

  it("feeds the slot engine: a Sunday opening produces Sunday slots", () => {
    const slots = computeSlotsForDay({
      dateISO: SUN,
      timezone: IST,
      rules: resolveIntervalsForDate(
        WEEKLY,
        [
          {
            startsOn: SUN,
            endsOn: SUN,
            intervals: [{ startMinutes: 600, endMinutes: 660 }],
          },
        ],
        SUN,
        IST
      ),
      durationMinutes: 30,
      granularityMinutes: 30,
      existingBookings: [],
      now: new Date("2026-10-01T00:00:00Z"),
      minLeadTimeMinutes: 0,
    });
    // 10:00 and 10:30 Istanbul.
    expect(slots.map((s) => s.start.toISOString())).toEqual([
      "2026-11-01T07:00:00.000Z",
      "2026-11-01T07:30:00.000Z",
    ]);
  });
});

describe("dateOverrides", () => {
  it("marks only the dates an exception touches, open or closed", () => {
    const exceptions: DateException[] = [
      closed("2026-10-28", "2026-10-29"),
      {
        startsOn: SUN,
        endsOn: SUN,
        intervals: [{ startMinutes: 600, endMinutes: 660 }],
      },
    ];
    const window = [
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      SUN,
    ];
    expect(dateOverrides(exceptions, window)).toEqual({
      "2026-10-28": false,
      "2026-10-29": false,
      [SUN]: true,
    });
  });
});
