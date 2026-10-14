import "server-only";
import { and, eq, gt, sql } from "drizzle-orm";
import {
  REFUND_NOTICE_HOURS,
  refundsDeposit,
} from "@/lib/booking/cancellation-policy";
import { getBookingForPage } from "@/lib/booking/confirmation";
import { expireHoldsForOrg } from "@/lib/booking/expire-holds";
import {
  type BusinessContext,
  getAvailableSlots,
  localDateISO,
} from "@/lib/booking/get-available-slots";
import { db } from "@/lib/db";
import { isExclusionConflict } from "@/lib/db/errors";
import { bookings } from "@/lib/db/schema/booking-schema";
import { sendBookingRescheduledEmail } from "@/lib/email/booking-notifications";

type Booking = typeof bookings.$inferSelect;

export type CustomerRescheduleCoreInput = {
  business: BusinessContext;
  bookingId: string;
  /** The assistant's customer: the booking must be theirs. */
  customerRef: string;
  newStartsAt: Date;
  now?: Date;
};

export type CustomerRescheduleErrorCode =
  | "not_found"
  | "already_cancelled"
  | "pending"
  | "started"
  | "move_window_closed"
  | "slot_unavailable"
  | "slot_taken";

export type CustomerRescheduleCoreResult =
  | { ok: true; booking: Booking; previousStartsAt: Date }
  | { ok: false; code: CustomerRescheduleErrorCode; message: string };

function fail(
  code: CustomerRescheduleErrorCode,
  message: string
): CustomerRescheduleCoreResult {
  return { ok: false, code, message };
}

/**
 * A chat customer moves their own booking, keeping its length.
 *
 * Unlike the owner (rescheduleBooking), a customer is held to the slot grid:
 * the new time must be one the booking page would offer, with the booking's
 * own current time left out of the busy times so that a move overlapping it
 * is not refused by itself. A booking awaiting its kapora stays where it is —
 * its hold and its payment page both belong to the time the customer chose.
 * The exclusion constraint decides a race, on an UPDATE as on an INSERT.
 */
export async function customerRescheduleCore(
  input: CustomerRescheduleCoreInput
): Promise<CustomerRescheduleCoreResult> {
  const now = input.now ?? new Date();
  const { business, newStartsAt } = input;

  const found = await getBookingForPage(
    business.organizationId,
    input.bookingId
  );
  if (!found || found.booking.customerRef !== input.customerRef) {
    return fail("not_found", "Randevu bulunamadı.");
  }
  const { booking } = found;

  if (booking.status === "cancelled") {
    return fail("already_cancelled", "İptal edilmiş bir randevu taşınamaz.");
  }
  if (booking.status === "pending") {
    return fail("pending", "Kaporası beklenen bir randevu taşınamaz.");
  }
  if (booking.startsAt <= now) {
    return fail("started", "Başlamış bir randevu taşınamaz.");
  }
  // Inside the last day a paid kapora stays with the business
  // (lib/booking/cancellation-policy.ts). A move then would let the customer
  // carry the booking out of that day and cancel the new time with notice —
  // the kapora back after all — so it stays put; the business can still move
  // it from the panel.
  const paid =
    booking.paymentTransactionId !== null && booking.depositCents !== null;
  if (paid && !refundsDeposit(booking.startsAt, now)) {
    return fail(
      "move_window_closed",
      `Randevuya ${REFUND_NOTICE_HOURS} saatten az kaldığı için kaporalı randevu taşınamaz — lütfen işletmeyle iletişime geçin.`
    );
  }
  if (newStartsAt.getTime() === booking.startsAt.getTime()) {
    return { ok: true, booking, previousStartsAt: booking.startsAt };
  }

  const dateISO = localDateISO(newStartsAt, business.profile.timezone);
  const slots = await getAvailableSlots(
    business,
    booking.serviceId,
    dateISO,
    now,
    { excludeBookingId: booking.id }
  );
  if (!slots?.some((slot) => slot.getTime() === newStartsAt.getTime())) {
    return fail(
      "slot_unavailable",
      "Bu saat artık müsait değil — lütfen başka bir saat seçin."
    );
  }

  // The slot lookup already treats a lapsed hold as free, but the exclusion
  // constraint counts it until it is released — release them here, as
  // createBookingCore does before its insert, or the move trips on a hold
  // nobody is paying for.
  await expireHoldsForOrg(business.organizationId);

  const endsAt = new Date(
    newStartsAt.getTime() +
      (booking.endsAt.getTime() - booking.startsAt.getTime())
  );

  let moved: Booking | undefined;
  try {
    [moved] = await db
      .update(bookings)
      .set({ startsAt: newStartsAt, endsAt })
      .where(
        and(
          eq(bookings.id, booking.id),
          eq(bookings.organizationId, business.organizationId),
          eq(bookings.status, "confirmed"),
          gt(bookings.startsAt, sql`now()`)
        )
      )
      .returning();
  } catch (err) {
    if (isExclusionConflict(err)) {
      return fail(
        "slot_taken",
        "Bu saat az önce doldu — lütfen başka bir saat seçin."
      );
    }
    throw err;
  }
  // Cancelled, or begun, between the read and the write.
  if (!moved) return fail("not_found", "Randevu bulunamadı.");

  await sendBookingRescheduledEmail(moved, booking.startsAt);
  return { ok: true, booking: moved, previousStartsAt: booking.startsAt };
}
