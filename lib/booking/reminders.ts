import "server-only";
import { and, eq, gt, gte, isNotNull, isNull, lt, lte } from "drizzle-orm";
import { getBilling } from "@/lib/billing/get-billing";
import { planHasFeature } from "@/lib/billing/plans";
import { db } from "@/lib/db";
import { bookings } from "@/lib/db/schema/booking-schema";
import { businessProfiles } from "@/lib/db/schema/business-schema";
import { sendBookingReminderEmail } from "@/lib/email/booking-notifications";
import { tomorrowWindow } from "./reminder-window";

type Booking = typeof bookings.$inferSelect;

const HOUR_MS = 3_600_000;

/**
 * A booking made this recently is not reminded: its confirmation is still
 * fresh, and a reminder an hour after it reads as noise.
 */
export const FRESH_BOOKING_HOURS = 12;

/**
 * Wide enough to hold "tomorrow" in any timezone, 25-hour days included.
 * Only narrows the search for businesses; each one's own window decides.
 */
const LOOKAHEAD_HOURS = 72;

export type ReminderTally = {
  /** Businesses that had at least one booking to remind. */
  businesses: number;
  sent: number;
  failed: number;
};

export type SendReminder = (booking: Booking, now: Date) => Promise<boolean>;

/** Confirmed, somewhere to send it, and not reminded yet. */
const remindable = () =>
  and(
    eq(bookings.status, "confirmed"),
    isNotNull(bookings.customerEmail),
    isNull(bookings.reminderSentAt)
  );

function candidateBusinesses(now: Date) {
  return db
    .selectDistinct({
      organizationId: bookings.organizationId,
      timezone: businessProfiles.timezone,
    })
    .from(bookings)
    .innerJoin(
      businessProfiles,
      eq(businessProfiles.organizationId, bookings.organizationId)
    )
    .where(
      and(
        remindable(),
        gt(bookings.startsAt, now),
        lte(
          bookings.startsAt,
          new Date(now.getTime() + LOOKAHEAD_HOURS * HOUR_MS)
        )
      )
    );
}

/**
 * Mark a business's bookings for tomorrow as reminded, and hand them back.
 * Claimed before anything is sent: of two runs at once, the second finds
 * every row already taken, so nobody hears twice.
 */
function claim(
  organizationId: string,
  timezone: string,
  now: Date
): Promise<Booking[]> {
  const { start, end } = tomorrowWindow(now, timezone);
  return db
    .update(bookings)
    .set({ reminderSentAt: now })
    .where(
      and(
        eq(bookings.organizationId, organizationId),
        remindable(),
        gte(bookings.startsAt, start),
        lt(bookings.startsAt, end),
        lte(
          bookings.createdAt,
          new Date(now.getTime() - FRESH_BOOKING_HOURS * HOUR_MS)
        )
      )
    )
    .returning();
}

async function release(bookingId: string) {
  await db
    .update(bookings)
    .set({ reminderSentAt: null })
    .where(eq(bookings.id, bookingId));
}

/**
 * The day-before reminder, from the daily cron: every confirmed booking
 * tomorrow — in its own business's timezone — gets one email, for businesses
 * whose plan includes it. The cron runs at 09:00 Istanbul, so it arrives the
 * morning before.
 *
 * A send that fails releases its claim. Each business is guarded on its own,
 * like the renewals beside it: one that fails must not strand the rest.
 */
export async function sendDayBeforeReminders(
  now: Date,
  { send = sendBookingReminderEmail }: { send?: SendReminder } = {}
): Promise<ReminderTally> {
  const tally: ReminderTally = { businesses: 0, sent: 0, failed: 0 };

  for (const { organizationId, timezone } of await candidateBusinesses(now)) {
    try {
      const billing = await getBilling(organizationId);
      if (!planHasFeature(billing.plan, "bookingReminders")) continue;

      const claimed = await claim(organizationId, timezone, now);
      if (claimed.length > 0) tally.businesses += 1;

      for (const booking of claimed) {
        let ok = false;
        try {
          ok = await send(booking, now);
        } catch (err) {
          console.error(`Reminder failed for booking ${booking.id}:`, err);
        }
        if (ok) {
          tally.sent += 1;
        } else {
          await release(booking.id);
          tally.failed += 1;
        }
      }
    } catch (err) {
      console.error(`Reminders failed for ${organizationId}:`, err);
      tally.failed += 1;
    }
  }

  return tally;
}
