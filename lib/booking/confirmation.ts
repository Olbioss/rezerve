import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { bookings } from "@/lib/db/schema/booking-schema";
import { services } from "@/lib/db/schema/service-schema";

/** Where a booking's own page lives. */
export function confirmationPath(slug: string, bookingId: string): string {
  return `/r/${slug}/onay/${bookingId}`;
}

/**
 * The same page as an absolute address, for places with no request to
 * resolve against — emails and calendar files. Null when the app's own URL
 * is not configured, so a missing link never costs the email.
 */
export function confirmationUrl(
  slug: string,
  bookingId: string
): string | null {
  try {
    return new URL(
      confirmationPath(slug, bookingId),
      process.env.NEXT_PUBLIC_APP_URL
    ).href;
  } catch {
    return null;
  }
}

/**
 * A booking as its public page sees it, with its service.
 *
 * The id is the whole credential — a random uuid in a link only the customer
 * was sent — and it is checked before Postgres sees it: a link cut short in
 * a message is not a uuid, and the database would reject it with a 500 for
 * what is only a wrong address.
 */
export async function getBookingForPage(
  organizationId: string,
  bookingId: string
) {
  if (!z.uuid().safeParse(bookingId).success) return null;
  const booking = await db.query.bookings.findFirst({
    where: and(
      eq(bookings.id, bookingId),
      eq(bookings.organizationId, organizationId)
    ),
  });
  if (!booking) return null;
  const service = await db.query.services.findFirst({
    where: eq(services.id, booking.serviceId),
  });
  return { booking, service: service ?? null };
}
