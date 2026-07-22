import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings } from "@/lib/db/schema/booking-schema";
import { sendBookingConfirmedEmails } from "@/lib/email/booking-notifications";

/**
 * Payment-callback business logic, separated from the route for testing.
 *
 * Idempotent by construction: both transitions are guarded UPDATEs on
 * status='pending' AND the stored payment token, so duplicate callbacks,
 * replayed tokens and out-of-order results match zero rows and do nothing
 * (no second email, no state clobbering).
 */

export type PaymentOutcome = "confirmed" | "cancelled" | "noop";

/** Successful payment: confirm the held booking and send emails once. */
export async function confirmPaidBooking(
  bookingId: string,
  token: string
): Promise<PaymentOutcome> {
  const [confirmed] = await db
    .update(bookings)
    .set({ status: "confirmed", expiresAt: null })
    .where(
      and(
        eq(bookings.id, bookingId),
        eq(bookings.paymentToken, token),
        eq(bookings.status, "pending")
      )
    )
    .returning();
  if (!confirmed) return "noop";
  await sendBookingConfirmedEmails(confirmed);
  return "confirmed";
}

/** Failed/abandoned payment: release the hold. No email for a failed attempt. */
export async function cancelFailedPayment(
  bookingId: string,
  token: string
): Promise<PaymentOutcome> {
  const [cancelled] = await db
    .update(bookings)
    .set({ status: "cancelled", cancelledAt: sql`now()` })
    .where(
      and(
        eq(bookings.id, bookingId),
        eq(bookings.paymentToken, token),
        eq(bookings.status, "pending")
      )
    )
    .returning();
  return cancelled ? "cancelled" : "noop";
}
