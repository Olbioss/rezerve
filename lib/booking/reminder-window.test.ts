import { describe, expect, it } from "vitest";
import { tomorrowWindow } from "./reminder-window";

const IST = "Europe/Istanbul";
const NY = "America/New_York";
const HOUR_MS = 3_600_000;

const iso = ({ start, end }: { start: Date; end: Date }) => ({
  start: start.toISOString(),
  end: end.toISOString(),
});

describe("tomorrowWindow", () => {
  it("is the business's next local day, from the 09:00 Istanbul run", () => {
    // 06:00 UTC is when the cron runs: Monday 23 November, 09:00 in Istanbul.
    expect(iso(tomorrowWindow(new Date("2026-11-23T06:00:00Z"), IST))).toEqual({
      start: "2026-11-23T21:00:00.000Z",
      end: "2026-11-24T21:00:00.000Z",
    });
  });

  it("counts from the local date, not the UTC one", () => {
    // 23:30 on the 23rd in Istanbul: tomorrow is still the 24th.
    expect(iso(tomorrowWindow(new Date("2026-11-23T20:30:00Z"), IST))).toEqual({
      start: "2026-11-23T21:00:00.000Z",
      end: "2026-11-24T21:00:00.000Z",
    });
    // 00:30 on the 24th in Istanbul, though the 23rd in UTC: tomorrow is the 25th.
    expect(iso(tomorrowWindow(new Date("2026-11-23T21:30:00Z"), IST))).toEqual({
      start: "2026-11-24T21:00:00.000Z",
      end: "2026-11-25T21:00:00.000Z",
    });
  });

  it("crosses into a new year", () => {
    expect(iso(tomorrowWindow(new Date("2026-12-31T06:00:00Z"), IST))).toEqual({
      start: "2026-12-31T21:00:00.000Z",
      end: "2027-01-01T21:00:00.000Z",
    });
  });

  it("is 25 hours long when tomorrow is New York's fall-back day", () => {
    // Saturday 31 October, 02:00 EDT; the clocks go back on Sunday 1 November.
    const window = tomorrowWindow(new Date("2026-10-31T06:00:00Z"), NY);
    expect(iso(window)).toEqual({
      start: "2026-11-01T04:00:00.000Z", // midnight EDT
      end: "2026-11-02T05:00:00.000Z", // midnight EST
    });
    expect(window.end.getTime() - window.start.getTime()).toBe(25 * HOUR_MS);
  });

  it("is 23 hours long when tomorrow is New York's spring-forward day", () => {
    // Saturday 7 March, 01:00 EST; the clocks go forward on Sunday 8 March.
    const window = tomorrowWindow(new Date("2026-03-07T06:00:00Z"), NY);
    expect(iso(window)).toEqual({
      start: "2026-03-08T05:00:00.000Z", // midnight EST
      end: "2026-03-09T04:00:00.000Z", // midnight EDT
    });
    expect(window.end.getTime() - window.start.getTime()).toBe(23 * HOUR_MS);
  });
});
