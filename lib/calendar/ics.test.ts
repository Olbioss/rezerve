import { describe, expect, it } from "vitest";
import { bookingIcs, googleCalendarUrl } from "./ics";

const event = {
  uid: "6f1c2a9e-3b7d-4c1e-9a2f-0d8e5b4c3a21",
  start: new Date("2026-10-05T07:00:00.000Z"),
  end: new Date("2026-10-05T07:30:00.000Z"),
  stamp: new Date("2026-10-02T09:15:00.000Z"),
  summary: "Saç Kesimi — Rezerve Demo Salon",
};

/** RFC 5545 §3.1: a CRLF followed by one space continues the line. */
const unfold = (ics: string) => ics.replace(/\r\n /g, "");

describe("bookingIcs", () => {
  it("is one published VEVENT with UTC times and CRLF line endings", () => {
    const ics = bookingIcs(event);
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toContain("\n");
    const lines = unfold(ics).trimEnd().split("\r\n");
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines.at(-1)).toBe("END:VCALENDAR");
    expect(lines).toContain("VERSION:2.0");
    expect(lines).toContain("METHOD:PUBLISH");
    expect(lines.filter((l) => l === "BEGIN:VEVENT")).toHaveLength(1);
    expect(lines).toContain(`UID:${event.uid}@rezerve`);
    expect(lines).toContain("DTSTAMP:20261002T091500Z");
    expect(lines).toContain("DTSTART:20261005T070000Z");
    expect(lines).toContain("DTEND:20261005T073000Z");
    expect(lines).toContain("SEQUENCE:0");
    expect(lines).toContain("STATUS:CONFIRMED");
    expect(lines).toContain("SUMMARY:Saç Kesimi — Rezerve Demo Salon");
  });

  it("escapes the characters RFC 5545 reserves in text", () => {
    const ics = unfold(
      bookingIcs({
        ...event,
        location: "Bağdat Cad. No: 5, Kadıköy; İstanbul",
        description: "Kapora: ₺300\nTelefon: 0532 123 45 67 \\ ara",
      })
    );
    expect(ics).toContain(
      "LOCATION:Bağdat Cad. No: 5\\, Kadıköy\\; İstanbul\r\n"
    );
    expect(ics).toContain(
      "DESCRIPTION:Kapora: ₺300\\nTelefon: 0532 123 45 67 \\\\ ara\r\n"
    );
  });

  it("folds lines over 75 octets without splitting a Turkish character", () => {
    const description = "Çağrı Şükrü Öztürk ığdır ".repeat(12).trim();
    const ics = bookingIcs({ ...event, description });
    for (const line of ics.split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
      // A split multi-byte character decodes to U+FFFD.
      expect(line).not.toContain("�");
    }
    expect(unfold(ics)).toContain(`DESCRIPTION:${description}\r\n`);
  });

  it("leaves out the optional fields it was not given", () => {
    const ics = bookingIcs(event);
    expect(ics).not.toMatch(/^(LOCATION|DESCRIPTION|URL):/m);
  });

  it("carries the address, the link and a sequence when given", () => {
    const ics = unfold(
      bookingIcs({
        ...event,
        url: "https://example.test/r/demo/onay/abc",
        sequence: 1791,
      })
    );
    expect(ics).toContain("URL:https://example.test/r/demo/onay/abc\r\n");
    expect(ics).toContain("SEQUENCE:1791\r\n");
  });
});

describe("googleCalendarUrl", () => {
  it("opens Google Calendar's template with the same UTC times", () => {
    const url = new URL(
      googleCalendarUrl({
        ...event,
        location: "Kadıköy, İstanbul",
        description: "Kapora: ₺300",
      })
    );
    expect(url.origin + url.pathname).toBe(
      "https://calendar.google.com/calendar/render"
    );
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("text")).toBe(event.summary);
    expect(url.searchParams.get("dates")).toBe(
      "20261005T070000Z/20261005T073000Z"
    );
    expect(url.searchParams.get("location")).toBe("Kadıköy, İstanbul");
    expect(url.searchParams.get("details")).toBe("Kapora: ₺300");
  });
});
