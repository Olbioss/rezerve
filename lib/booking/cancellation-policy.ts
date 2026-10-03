/**
 * When a customer cancels their own booking, and what happens to the kapora.
 *
 * A customer may cancel until the appointment starts. With at least a day's
 * notice the kapora goes back to them in full; inside that day the slot is
 * still freed, but the business keeps the kapora — the no-show protection it
 * was paid for. The same 24 hours applies to every business.
 *
 * Pure and free of imports, so the booking page in the browser, the server
 * action and the emails all read the one rule.
 */
export const REFUND_NOTICE_HOURS = 24;

const NOTICE_MS = REFUND_NOTICE_HOURS * 3_600_000;

/** The last instant a cancellation still returns the kapora. */
export function refundDeadline(startsAt: Date): Date {
  return new Date(startsAt.getTime() - NOTICE_MS);
}

/** Whether cancelling at `now` returns the kapora. */
export function refundsDeposit(startsAt: Date, now: Date): boolean {
  return now.getTime() <= refundDeadline(startsAt).getTime();
}

/** Whether the customer can still cancel: not already, and not once started. */
export function customerCanCancel(
  booking: { status: string; startsAt: Date },
  now: Date
): boolean {
  return booking.status !== "cancelled" && now < booking.startsAt;
}
