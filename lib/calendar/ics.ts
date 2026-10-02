/**
 * A booking as a calendar event: the .ics file the confirmation page offers
 * and the customer's emails attach, and the Google Calendar link beside it.
 *
 * Written out by hand rather than pulled in as a dependency. It is one
 * VEVENT, and the RFC 5545 rules it needs fit on a screen: UTC times, four
 * escaped characters, CRLF line endings, and folding at 75 octets.
 */
export type CalendarEvent = {
  /** Stable for the booking's life, so a newer file replaces the old event. */
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  location?: string | null;
  description?: string | null;
  url?: string | null;
  /** Higher on every change, so a calendar keeps the newest copy. */
  sequence?: number;
  /** When this copy was made; now, unless a test says otherwise. */
  stamp?: Date;
};

/** 2026-10-05T07:00:00.000Z → 20261005T070000Z */
function utc(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

/** RFC 5545 §3.3.11: backslash, semicolon, comma and newline are escaped. */
function text(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

const encoder = new TextEncoder();

/**
 * RFC 5545 §3.1: no line longer than 75 octets, continued on the next line
 * after a single space — and never split inside a character, which matters
 * once a business name has a ğ or an İ in it.
 */
function fold(line: string): string {
  const parts: string[] = [];
  let current = "";
  let octets = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    // A continuation line's leading space counts towards its 75.
    const limit = parts.length === 0 ? 75 : 74;
    if (octets + size > limit) {
      parts.push(current);
      current = "";
      octets = 0;
    }
    current += char;
    octets += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function bookingIcs(event: CalendarEvent): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Rezerve//Randevu//TR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.uid}@rezerve`,
    `DTSTAMP:${utc(event.stamp ?? new Date())}`,
    `DTSTART:${utc(event.start)}`,
    `DTEND:${utc(event.end)}`,
    `SEQUENCE:${event.sequence ?? 0}`,
    `SUMMARY:${text(event.summary)}`,
    event.location && `LOCATION:${text(event.location)}`,
    event.description && `DESCRIPTION:${text(event.description)}`,
    // A URI value, not text: its commas are not escaped.
    event.url && `URL:${event.url}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter((line): line is string => Boolean(line));
  return `${lines.map(fold).join("\r\n")}\r\n`;
}

/** The same event as a link that opens Google Calendar's "add" screen. */
export function googleCalendarUrl(
  event: Pick<
    CalendarEvent,
    "start" | "end" | "summary" | "location" | "description"
  >
): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.summary,
    dates: `${utc(event.start)}/${utc(event.end)}`,
  });
  if (event.location) params.set("location", event.location);
  if (event.description) params.set("details", event.description);
  return `https://calendar.google.com/calendar/render?${params}`;
}
