import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings } from "@/lib/db/schema/booking-schema";
import { sendBookingConfirmedEmails } from "@/lib/email/booking-notifications";
import { getPaymentProvider } from "@/lib/payments";

/**
 * Payment-callback business logic, separated from the route for testing.
 *
 * Idempotent by construction: both transitions are guarded UPDATEs on
 * status='pending' AND the stored payment token, so duplicate callbacks,
 * replayed tokens and out-of-order results match zero rows and do nothing
 * (no second email, no state clobbering).
 */

export type PaymentOutcome = "confirmed" | "cancelled" | "noop";

/**
 * Successful payment: confirm the held booking, release the kapora, and send
 * emails once.
 *
 * The release matters. iyzico holds a marketplace payment until the platform
 * approves the item transaction, so without it the money reaches the
 * business's submerchant and never leaves. Rezerve approves immediately: a
 * kapora is a non-refundable booking deposit, so there is nothing to wait for.
 *
 * Approval runs inside the same guarded transition, so it happens exactly once
 * — a replayed callback matches zero rows and never reaches it.
 */
export async function confirmPaidBooking(
  bookingId: string,
  token: string,
  paymentTransactionId: string | null = null
): Promise<PaymentOutcome> {
  const [confirmed] = await db
    .update(bookings)
    .set({ status: "confirmed", expiresAt: null, paymentTransactionId })
    .where(
      and(
        eq(bookings.id, bookingId),
        eq(bookings.paymentToken, token),
        eq(bookings.status, "pending")
      )
    )
    .returning();
  if (!confirmed) return "noop";

  if (paymentTransactionId) {
    try {
      await getPaymentProvider().approveTransaction(paymentTransactionId);
    } catch (err) {
      // The booking is paid and confirmed either way; only the payout is
      // stuck, and the id is stored so it can be released by hand.
      console.error(
        `Kapora approval failed for booking ${bookingId} (tx ${paymentTransactionId}):`,
        err
      );
    }
  }

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
