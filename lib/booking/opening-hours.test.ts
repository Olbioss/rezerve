import { describe, expect, it } from "vitest";
import type { DateException } from "./exceptions";
import { localInstant, withinOpeningHours } from "./opening-hours";
import type { AvailabilityInterval } from "./slots";

/** Europe/Istanbul is UTC+3 year-round. */
const IST = "Europe/Istanbul";

/** Mon–Sat 10:00–13:00 and 14:00–19:00: a salon with a lunch break. */
const WEEKLY: AvailabilityInterval[] = [1, 2, 3, 4, 5, 6].flatMap((weekday) => [
  { weekday, startMinutes: 10 * 60, endMinutes: 13 * 60 },
  { weekday, startMinutes: 14 * 60, endMinutes: 19 * 60 },
]);

// 2026-10-28 is a Wednesday, 2026-11-01 a Sunday.
const at = (dateISO: string, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return localInstant(dateISO, h * 60 + m, IST);
};

function fits(
  dateISO: string,
  from: string,
  to: string,
  exceptions: DateException[] = []
) {
  return withinOpeningHours({
    rules: WEEKLY,
    exceptions,
    startsAt: at(dateISO, from),
    endsAt: at(dateISO, to),
    timezone: IST,
  });
}

describe("localInstant", () => {
  it("reads a wall-clock time in the business's timezone", () => {
    expect(localInstant("2026-10-28", 10 * 60, IST).toISOString()).toBe(
      "2026-10-28T07:00:00.000Z"
    );
  });
});

describe("withinOpeningHours", () => {
  it("accepts an appointment inside a shift", () => {
    expect(fits("2026-10-28", "10:00", "11:00")).toBe(true);
  });

  it("accepts a time off the slot grid, as long as it fits", () => {
    // Owners are not held to the 30-minute grid customers pick from.
    expect(fits("2026-10-28", "10:15", "10:45")).toBe(true);
  });

  it("refuses one that runs past closing", () => {
    expect(fits("2026-10-28", "18:30", "19:30")).toBe(false);
  });

  it("refuses one that runs into the lunch break", () => {
    expect(fits("2026-10-28", "12:30", "13:30")).toBe(false);
  });

  it("refuses a day the business never opens", () => {
    expect(fits("2026-11-01", "11:00", "12:00")).toBe(false);
  });

  it("refuses a date an exception closes", () => {
    const holiday: DateException = {
      startsOn: "2026-10-28",
      endsOn: "2026-10-28",
      intervals: [],
    };
    expect(fits("2026-10-28", "10:00", "11:00", [holiday])).toBe(false);
  });

  it("accepts one-off hours an exception opens", () => {
    const sunday: DateException = {
      startsOn: "2026-11-01",
      endsOn: "2026-11-01",
      intervals: [{ startMinutes: 11 * 60, endMinutes: 14 * 60 }],
    };
    expect(fits("2026-11-01", "11:00", "12:00", [sunday])).toBe(true);
  });

  it("refuses an appointment that runs past midnight", () => {
    expect(
      withinOpeningHours({
        rules: [{ weekday: 3, startMinutes: 0, endMinutes: 1440 }],
        exceptions: [],
        startsAt: at("2026-10-28", "23:30"),
        endsAt: at("2026-10-29", "00:30"),
        timezone: IST,
      })
    ).toBe(false);
  });
});
