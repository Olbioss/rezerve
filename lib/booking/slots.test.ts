import { describe, expect, it } from "vitest";
import { computeSlotsForDay, type SlotInput } from "./slots";

/** Europe/Istanbul is UTC+3 year-round (no DST since 2016). */
const IST = "Europe/Istanbul";
/** America/New_York has DST: EST = UTC-5, EDT = UTC-4. */
const NY = "America/New_York";

function base(overrides: Partial<SlotInput> = {}): SlotInput {
  return {
    dateISO: "2026-08-05", // a Wednesday
    timezone: IST,
    rules: [{ weekday: 3, startMinutes: 9 * 60, endMinutes: 12 * 60 }],
    durationMinutes: 30,
    granularityMinutes: 30,
    existingBookings: [],
    now: new Date("2026-08-01T00:00:00Z"),
    minLeadTimeMinutes: 0,
    ...overrides,
  };
}

function iso(slots: Date[]): string[] {
  return slots.map((d) => d.toISOString());
}

describe("computeSlotsForDay", () => {
  it("steps through an open interval by granularity", () => {
    // 09:00–12:00 local (UTC+3) with 30-min service = 6 slots 06:00Z–08:30Z.
    expect(iso(computeSlotsForDay(base()))).toEqual([
      "2026-08-05T06:00:00.000Z",
      "2026-08-05T06:30:00.000Z",
      "2026-08-05T07:00:00.000Z",
      "2026-08-05T07:30:00.000Z",
      "2026-08-05T08:00:00.000Z",
      "2026-08-05T08:30:00.000Z",
    ]);
  });

  it("only emits slots whose full duration fits in the window", () => {
    // 60-min service in a 09:00–12:00 window: last start is 11:00 local.
    const slots = computeSlotsForDay(base({ durationMinutes: 60 }));
    expect(iso(slots)).toEqual([
      "2026-08-05T06:00:00.000Z",
      "2026-08-05T06:30:00.000Z",
      "2026-08-05T07:00:00.000Z",
      "2026-08-05T07:30:00.000Z",
      "2026-08-05T08:00:00.000Z",
    ]);
  });

  it("returns no slots on a closed day", () => {
    expect(computeSlotsForDay(base({ rules: [] }))).toEqual([]);
  });

  it("supports split shifts (multiple intervals per day)", () => {
    const slots = computeSlotsForDay(
      base({
        rules: [
          { weekday: 3, startMinutes: 9 * 60, endMinutes: 10 * 60 },
          { weekday: 3, startMinutes: 14 * 60, endMinutes: 15 * 60 },
        ],
      })
    );
    expect(iso(slots)).toEqual([
      "2026-08-05T06:00:00.000Z",
      "2026-08-05T06:30:00.000Z",
      "2026-08-05T11:00:00.000Z",
      "2026-08-05T11:30:00.000Z",
    ]);
  });

  it("ignores rules for other weekdays", () => {
    const slots = computeSlotsForDay(
      base({ rules: [{ weekday: 4, startMinutes: 540, endMinutes: 720 }] })
    );
    expect(slots).toEqual([]);
  });

  it("excludes slots overlapping existing bookings", () => {
    // Booking 07:00Z–07:30Z (10:00–10:30 local) knocks out the 10:00 slot.
    const slots = computeSlotsForDay(
      base({
        existingBookings: [
          {
            startsAt: new Date("2026-08-05T07:00:00Z"),
            endsAt: new Date("2026-08-05T07:30:00Z"),
          },
        ],
      })
    );
    expect(iso(slots)).not.toContain("2026-08-05T07:00:00.000Z");
    expect(iso(slots)).toContain("2026-08-05T06:30:00.000Z");
    expect(iso(slots)).toContain("2026-08-05T07:30:00.000Z");
  });

  it("excludes partial overlaps in both directions", () => {
    // 60-min service; booking 06:30Z–07:00Z overlaps starts 05:30Z(no—out of window), 06:00Z and 06:30Z.
    const slots = computeSlotsForDay(
      base({
        durationMinutes: 60,
        existingBookings: [
          {
            startsAt: new Date("2026-08-05T06:30:00Z"),
            endsAt: new Date("2026-08-05T07:00:00Z"),
          },
        ],
      })
    );
    expect(iso(slots)).toEqual([
      "2026-08-05T07:00:00.000Z",
      "2026-08-05T07:30:00.000Z",
      "2026-08-05T08:00:00.000Z",
    ]);
  });

  it("hides slots inside the minimum lead time", () => {
    // now = 06:45Z, lead 60min → earliest bookable instant is 07:45Z.
    const slots = computeSlotsForDay(
      base({
        now: new Date("2026-08-05T06:45:00Z"),
        minLeadTimeMinutes: 60,
      })
    );
    expect(iso(slots)).toEqual([
      "2026-08-05T08:00:00.000Z",
      "2026-08-05T08:30:00.000Z",
    ]);
  });

  it("returns nothing for a day entirely in the past", () => {
    const slots = computeSlotsForDay(
      base({ now: new Date("2026-09-01T00:00:00Z") })
    );
    expect(slots).toEqual([]);
  });

  it("uses a non-hour granularity correctly", () => {
    const slots = computeSlotsForDay(
      base({
        granularityMinutes: 45,
        rules: [{ weekday: 3, startMinutes: 9 * 60, endMinutes: 11 * 60 }],
      })
    );
    // Starts at 09:00, 09:45, 10:15? No — steps: 09:00, 09:45, 10:30 (+30min fits exactly at 11:00).
    expect(iso(slots)).toEqual([
      "2026-08-05T06:00:00.000Z",
      "2026-08-05T06:45:00.000Z",
      "2026-08-05T07:30:00.000Z",
    ]);
  });

  describe("DST handling (America/New_York)", () => {
    it("spring forward 2026-03-08: local 09:00 is UTC-4 after the jump", () => {
      // 2026-03-08 is a Sunday; clocks jump 02:00→03:00 EST→EDT.
      const slots = computeSlotsForDay(
        base({
          dateISO: "2026-03-08",
          timezone: NY,
          now: new Date("2026-03-01T00:00:00Z"),
          rules: [{ weekday: 0, startMinutes: 9 * 60, endMinutes: 10 * 60 }],
        })
      );
      // 09:00 EDT = 13:00Z (not 14:00Z).
      expect(iso(slots)).toEqual([
        "2026-03-08T13:00:00.000Z",
        "2026-03-08T13:30:00.000Z",
      ]);
    });

    it("fall back 2026-11-01: local 09:00 is UTC-5 after the repeat", () => {
      // 2026-11-01 is a Sunday; clocks fall back 02:00→01:00 EDT→EST.
      const slots = computeSlotsForDay(
        base({
          dateISO: "2026-11-01",
          timezone: NY,
          rules: [{ weekday: 0, startMinutes: 9 * 60, endMinutes: 10 * 60 }],
        })
      );
      // 09:00 EST = 14:00Z.
      expect(iso(slots)).toEqual([
        "2026-11-01T14:00:00.000Z",
        "2026-11-01T14:30:00.000Z",
      ]);
    });
  });
});
