import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings } from "@/lib/db/schema/booking-schema";
import { getPaymentProvider } from "@/lib/payments";

/**
 * Return a cancelled booking's kapora to the customer.
 *
 * Every cancellation in the app is owner-initiated — cancelBooking is behind
 * requireOwner — so the business is calling the appointment off and the
 * customer should not be out of pocket. A kapora only earns its keep against
 * a no-show, which is not this.
 *
 * Refund rather than disapproval: disapproval merely undoes an approval, and
 * refuses outright on a payment still held. A refund works either way, which
 * matters because the kapora is approved the moment it is paid.
 */

export type RefundOutcome = "refunded" | "failed" | "noop";

/**
 * Idempotent: the timestamp is claimed before iyzico is called, so a second
 * attempt finds it set and stops. A failure releases the claim, leaving the
 * booking refundable again rather than silently stuck as done.
 */
export async function refundDeposit(
  bookingId: string,
  customerIp: string,
  now: Date = new Date()
): Promise<RefundOutcome> {
  const booking = await db.query.bookings.findFirst({
    where: eq(bookings.id, bookingId),
  });
  if (
    !booking?.paymentTransactionId ||
    booking.depositCents == null ||
    booking.depositRefundedAt !== null
  ) {
    return "noop";
  }

  const [claimed] = await db
    .update(bookings)
    .set({ depositRefundedAt: now })
    .where(and(eq(bookings.id, bookingId), isNull(bookings.depositRefundedAt)))
    .returning();
  if (!claimed) return "noop";

  let refunded = false;
  let errorMessage: string | null = null;
  try {
    const result = await getPaymentProvider().refundTransaction({
      paymentTransactionId: booking.paymentTransactionId,
      amountCents: booking.depositCents,
      customerIp,
    });
    refunded = result.refunded;
    errorMessage = result.errorMessage;
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  if (refunded) return "refunded";

  await db
    .update(bookings)
    .set({ depositRefundedAt: null })
    .where(eq(bookings.id, bookingId));
  console.error(
    `Kapora refund failed for booking ${bookingId} (tx ${booking.paymentTransactionId}):`,
    errorMessage
  );
  return "failed";
}
