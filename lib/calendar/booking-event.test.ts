import { describe, expect, it } from "vitest";
import { bookingCalendarEvent } from "./booking-event";

const booking = {
  id: "6f1c2a9e-3b7d-4c1e-9a2f-0d8e5b4c3a21",
  startsAt: new Date("2026-10-05T07:00:00.000Z"),
  endsAt: new Date("2026-10-05T07:30:00.000Z"),
  businessName: "Rezerve Demo Salon",
  serviceName: "Saç Kesimi",
};

describe("bookingCalendarEvent", () => {
  it("names the service and the business, and spans the booking", () => {
    const event = bookingCalendarEvent(booking);
    expect(event.uid).toBe(booking.id);
    expect(event.summary).toBe("Saç Kesimi — Rezerve Demo Salon");
    expect(event.start).toBe(booking.startsAt);
    expect(event.end).toBe(booking.endsAt);
    expect(event.description).toBeNull();
  });

  it("puts the phone and the booking's page in the description", () => {
    const event = bookingCalendarEvent({
      ...booking,
      address: "Kadıköy, İstanbul",
      phone: "0532 123 45 67",
      url: "https://example.test/r/demo/onay/x",
    });
    expect(event.location).toBe("Kadıköy, İstanbul");
    expect(event.description).toBe(
      "Telefon: 0532 123 45 67\nRandevunuz: https://example.test/r/demo/onay/x"
    );
    expect(event.url).toBe("https://example.test/r/demo/onay/x");
  });

  it("numbers each copy by when it was made, so a newer copy wins", () => {
    const before = Math.floor(Date.now() / 1000);
    const { sequence } = bookingCalendarEvent(booking);
    expect(sequence).toBeGreaterThanOrEqual(before);
    expect(sequence).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
  });
});
