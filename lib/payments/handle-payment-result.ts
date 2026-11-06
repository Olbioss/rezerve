import { and, eq, isNull, sql } from "drizzle-orm";
import { after } from "next/server";
import { notifyAssistant } from "@/lib/assistant/events";
import { localLabel } from "@/lib/assistant/format";
import { refundDeposit } from "@/lib/booking/refund-deposit";
import { db } from "@/lib/db";
import { organization } from "@/lib/db/schema/auth-schema";
import { bookings } from "@/lib/db/schema/booking-schema";
import { businessProfiles } from "@/lib/db/schema/business-schema";
import { services } from "@/lib/db/schema/service-schema";
import { sendBookingConfirmedEmails } from "@/lib/email/booking-notifications";
import { getPaymentProvider } from "@/lib/payments";

type Booking = typeof bookings.$inferSelect;

/**
 * Payment-callback business logic, separated from the route for testing.
 *
 * Idempotent by construction: both transitions are guarded UPDATEs on
 * status='pending' AND the stored payment token, so duplicate callbacks,
 * replayed tokens and out-of-order results match zero rows and do nothing
 * (no second email, no state clobbering).
 */

export type PaymentOutcome =
  | "confirmed"
  | "cancelled"
  /** Paid, but the booking was already gone — the money went back. */
  | "refunded"
  | "noop";

/**
 * Successful payment: confirm the held booking, release the kapora, and send
 * emails once.
 *
 * The release matters. iyzico holds a marketplace payment until the platform
 * approves the item transaction, so without it the money reaches the
 * business's submerchant and never leaves. Rezerve approves immediately, as
 * there is nothing to wait for: a kapora owed back on cancellation is returned
 * by refund, which works on a released payment too (see refundDeposit).
 *
 * Approval runs inside the same guarded transition, so it happens exactly once
 * — a replayed callback matches zero rows and never reaches it.
 */
export async function confirmPaidBooking(
  bookingId: string,
  token: string,
  paymentTransactionId: string | null = null,
  customerIp = "85.34.78.112"
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
  if (!confirmed) {
    // The booking was cancelled while the customer was paying — by the owner,
    // or by cancelExpiredHolds sweeping the lapsed hold on someone else's
    // booking attempt. iyzico still took the money, and the guard above means
    // nothing else will ever notice, so give it back.
    return paymentTransactionId
      ? await refundOrphanedPayment(
          bookingId,
          token,
          paymentTransactionId,
          customerIp
        )
      : "noop";
  }

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
  if (confirmed.source === "assistant") {
    // Once the redirect is sent: a cold-starting assistant never holds up the
    // customer's confirmation page.
    after(() => tellAssistant(confirmed));
  }
  return "confirmed";
}

/**
 * The customer who booked in a chat hears there that their kapora arrived
 * (spec §6.5), as well as on the confirmation page and by email.
 */
async function tellAssistant(booking: Booking): Promise<void> {
  const [org, profile, service] = await Promise.all([
    db.query.organization.findFirst({
      where: eq(organization.id, booking.organizationId),
    }),
    db.query.businessProfiles.findFirst({
      where: eq(businessProfiles.organizationId, booking.organizationId),
    }),
    db.query.services.findFirst({ where: eq(services.id, booking.serviceId) }),
  ]);
  if (!org || !profile || !service || !booking.customerRef) return;
  await notifyAssistant({
    type: "booking.confirmed",
    booking_id: booking.id,
    business_slug: org.slug,
    customer_ref: booking.customerRef,
    service_name: service.name,
    local_label: localLabel(booking.startsAt, profile.timezone),
  });
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

/**
 * A payment that landed on a booking which no longer exists.
 *
 * The transaction id is stored before refunding: without it the payment has no
 * handle at all, so a refund that fails would leave money at iyzico with
 * nothing on our side pointing at it. Storing it first makes the failure
 * recoverable instead of invisible.
 */
async function refundOrphanedPayment(
  bookingId: string,
  token: string,
  paymentTransactionId: string,
  customerIp: string
): Promise<PaymentOutcome> {
  const booking = await db.query.bookings.findFirst({
    where: eq(bookings.id, bookingId),
  });
  if (
    booking?.status !== "cancelled" ||
    booking.paymentToken !== token ||
    booking.depositCents == null ||
    booking.depositRefundedAt !== null
  ) {
    return "noop";
  }

  await db
    .update(bookings)
    .set({ paymentTransactionId })
    .where(
      and(eq(bookings.id, bookingId), isNull(bookings.paymentTransactionId))
    );

  const outcome = await refundDeposit(bookingId, customerIp);
  if (outcome !== "refunded") {
    console.error(
      `Orphaned payment for cancelled booking ${bookingId} (tx ${paymentTransactionId}) could not be refunded.`
    );
  }
  return outcome === "refunded" ? "refunded" : "noop";
}
