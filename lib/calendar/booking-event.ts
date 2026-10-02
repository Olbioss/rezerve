import type { CalendarEvent } from "./ics";

/**
 * A booking as a calendar event.
 *
 * Every copy — the confirmation page's file, each email's attachment — is
 * made from the booking as it stands, so the newest copy is always the right
 * one. SEQUENCE is therefore the second the copy was made: it only grows, and
 * a calendar holding an older copy of the same UID takes the newer.
 */
export function bookingCalendarEvent(booking: {
  id: string;
  startsAt: Date;
  endsAt: Date;
  businessName: string;
  serviceName: string;
  address?: string | null;
  phone?: string | null;
  url?: string | null;
}): CalendarEvent {
  const description = [
    booking.phone && `Telefon: ${booking.phone}`,
    booking.url && `Randevunuz: ${booking.url}`,
  ]
    .filter(Boolean)
    .join("\n");
  return {
    uid: booking.id,
    start: booking.startsAt,
    end: booking.endsAt,
    summary: `${booking.serviceName} — ${booking.businessName}`,
    location: booking.address,
    description: description || null,
    url: booking.url,
    sequence: Math.floor(Date.now() / 1000),
  };
}
