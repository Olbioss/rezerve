import { describe, expect, it } from "vitest";
import { localLabel, localTime } from "./format";

describe("localLabel", () => {
  it("says a time the way a person reads it back, in the business's timezone", () => {
    expect(
      localLabel(new Date("2026-10-17T12:30:00Z"), "Europe/Istanbul")
    ).toBe("Cumartesi 17 Ekim 15:30");
  });

  it("puts midnight on the business's new day, as 00:00", () => {
    expect(
      localLabel(new Date("2026-10-16T21:00:00Z"), "Europe/Istanbul")
    ).toBe("Cumartesi 17 Ekim 00:00");
  });

  it("follows the clock across a DST change", () => {
    // New York springs forward at 02:00 on 8 March 2026.
    expect(
      localLabel(new Date("2026-03-08T07:30:00Z"), "America/New_York")
    ).toBe("Pazar 8 Mart 03:30");
  });
});

describe("localTime", () => {
  it("pads the hour", () => {
    expect(localTime(new Date("2026-10-17T06:05:00Z"), "Europe/Istanbul")).toBe(
      "09:05"
    );
  });
});
