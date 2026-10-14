import "server-only";
import { and, eq, gt, sql } from "drizzle-orm";
import {
  customerCanCancel,
  refundsDeposit,
} from "@/lib/booking/cancellation-policy";
import { getBookingForPage } from "@/lib/booking/confirmation";
import { refundDeposit } from "@/lib/booking/refund-deposit";
import { db } from "@/lib/db";
import { bookings } from "@/lib/db/schema/booking-schema";
import { sendBookingCancelledEmails } from "@/lib/email/booking-notifications";

type Booking = typeof bookings.$inferSelect;

export type CustomerCancelCoreInput = {
  organizationId: string;
  bookingId: string;
  /**
   * The assistant's customer. When set, the booking must be theirs — the id
   * alone is not enough, since the model saw it in a tool result. Null on the
   * booking page, where the uuid in the link is the whole credential.
   */
  customerRef: string | null;
  /** What the customer was told: that their kapora would come back. */
  expectRefund: boolean;
  customerIp: string;
  now?: Date;
};

export type CustomerCancelErrorCode =
  | "not_found"
  | "already_cancelled"
  | "started"
  | "refund_window_closed";

export type CustomerCancelCoreResult =
  | {
      ok: true;
      booking: Booking;
      depositRefunded: boolean;
      /** Cancelled inside the last day: the business keeps the kapora. */
      depositKept: boolean;
      /** The kapora was due back, and iyzico refused or failed. */
      refundFailed: boolean;
    }
  | { ok: false; code: CustomerCancelErrorCode; message: string };

function fail(
  code: CustomerCancelErrorCode,
  message: string
): CustomerCancelCoreResult {
  return { ok: false, code, message };
}

/**
 * The customer calls their own appointment off — from its page, or through
 * the chat assistant.
 *
 * The kapora comes back with a day's notice and stays with the business
 * after that (lib/booking/cancellation-policy.ts); either way the slot is
 * freed at once. `expectRefund` is what the customer was told: if the
 * deadline passed since, nothing is cancelled and they are asked again
 * rather than surprised.
 */
export async function customerCancelCore(
  input: CustomerCancelCoreInput
): Promise<CustomerCancelCoreResult> {
  const now = input.now ?? new Date();

  const found = await getBookingForPage(input.organizationId, input.bookingId);
  if (
    !found ||
    (input.customerRef !== null &&
      found.booking.customerRef !== input.customerRef)
  ) {
    return fail("not_found", "Randevu bulunamadı.");
  }
  const { booking } = found;

  if (booking.status === "cancelled") {
    return fail("already_cancelled", "Bu randevu zaten iptal edilmiş.");
  }
  if (!customerCanCancel(booking, now)) {
    return fail("started", "Başlamış bir randevu iptal edilemez.");
  }

  const paid =
    booking.paymentTransactionId !== null && booking.depositCents !== null;
  const refundDue = paid && refundsDeposit(booking.startsAt, now);
  if (input.expectRefund && paid && !refundDue) {
    return fail(
      "refund_window_closed",
      "İade süresi doldu: kapora artık iade edilmiyor. Yine de iptal etmek isterseniz tekrar onaylayın."
    );
  }

  // Guarded like the owner's cancel, and against the appointment starting
  // between the check above and this write.
  const [cancelled] = await db
    .update(bookings)
    .set({
      status: "cancelled",
      cancelledAt: sql`now()`,
      cancelledBy: "customer",
    })
    .where(
      and(
        eq(bookings.id, booking.id),
        eq(bookings.organizationId, input.organizationId),
        sql`${bookings.status} <> 'cancelled'`,
        gt(bookings.startsAt, sql`now()`)
      )
    )
    .returning();
  if (!cancelled) {
    return fail("already_cancelled", "Bu randevu zaten iptal edilmiş.");
  }

  let depositRefunded = false;
  if (refundDue) {
    try {
      depositRefunded =
        (await refundDeposit(cancelled.id, input.customerIp)) === "refunded";
    } catch (err) {
      // Cancelled either way; the emails say the refund did not go through.
      console.error(`Kapora refund threw for booking ${cancelled.id}:`, err);
    }
  }
  const outcome = {
    depositKept: paid && !refundDue,
    refundFailed: refundDue && !depositRefunded,
  };

  await sendBookingCancelledEmails(cancelled, depositRefunded, {
    by: "customer",
    ...outcome,
  });
  return { ok: true, booking: cancelled, depositRefunded, ...outcome };
}
