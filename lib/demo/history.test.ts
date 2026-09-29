import { describe, expect, it } from "vitest";
import { withinOpeningHours } from "@/lib/booking/opening-hours";
import type { AvailabilityInterval } from "@/lib/booking/slots";
import { demoHistory } from "./history";

const IST = "Europe/Istanbul";

/** The demo's published hours: Mon–Sat 10–13 and 14–19. */
const HOURS: AvailabilityInterval[] = [1, 2, 3, 4, 5, 6].flatMap((weekday) => [
  { weekday, startMinutes: 10 * 60, endMinutes: 13 * 60 },
  { weekday, startMinutes: 14 * 60, endMinutes: 19 * 60 },
]);

const SERVICES = [
  { id: "sac", durationMinutes: 45 },
  { id: "cilt", durationMinutes: 60 },
  { id: "manikur", durationMinutes: 30 },
];

// A Tuesday morning in Istanbul.
const NOW = new Date("2026-09-29T06:00:00Z");
const history = () =>
  demoHistory({ now: NOW, timezone: IST, hours: HOURS, services: SERVICES });

describe("demoHistory", () => {
  it("fills more than one page of past bookings, and some upcoming ones", () => {
    const rows = history();
    const past = rows.filter((b) => b.startsAt < NOW);
    const upcoming = rows.filter((b) => b.startsAt >= NOW);
    // The bookings list shows 25 a page: the past tab has to paginate.
    expect(past.length).toBeGreaterThan(25);
    expect(upcoming.length).toBeGreaterThanOrEqual(10);
  });

  it("puts every booking inside the published hours", () => {
    for (const b of history()) {
      expect(
        withinOpeningHours({
          rules: HOURS,
          exceptions: [],
          startsAt: b.startsAt,
          endsAt: b.endsAt,
          timezone: IST,
        })
      ).toBe(true);
    }
  });

  it("never overlaps two live bookings — the exclusion constraint would refuse it", () => {
    const live = history()
      .filter((b) => b.status !== "cancelled")
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    for (let i = 1; i < live.length; i++) {
      expect(live[i].startsAt.getTime()).toBeGreaterThanOrEqual(
        live[i - 1].endsAt.getTime()
      );
    }
  });

  it("gives each booking its service's length", () => {
    for (const b of history()) {
      const service = SERVICES.find((s) => s.id === b.serviceId);
      expect(b.endsAt.getTime() - b.startsAt.getTime()).toBe(
        (service?.durationMinutes ?? 0) * 60_000
      );
    }
  });

  it("keeps upcoming bookings confirmed, and cancels a few past ones", () => {
    const rows = history();
    expect(
      rows
        .filter((b) => b.startsAt >= NOW)
        .every((b) => b.status === "confirmed")
    ).toBe(true);
    expect(rows.some((b) => b.status === "cancelled")).toBe(true);
  });

  it("gives no email, so a cancelled demo booking never writes to anyone", () => {
    for (const b of history()) {
      expect(b.customerEmail).toBeNull();
      // Istanbul subscriber numbers never begin with 0: these ring no one.
      expect(b.customerPhone).toMatch(/^0212 000 /);
    }
  });

  it("is the same history for the same moment", () => {
    expect(history()).toEqual(history());
  });
});
