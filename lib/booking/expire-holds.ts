import "server-only";
import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings } from "@/lib/db/schema/booking-schema";

/**
 * Release pending holds whose 30 minutes have run out.
 *
 * A hold occupies the exclusion constraint exactly like a confirmed booking,
 * which is what stops a slot being sold twice while someone is paying. Once it
 * lapses it has to be released or it blocks that slot forever.
 *
 * Two callers, one predicate. createBooking sweeps its own organization on the
 * way past, which is cheap and keeps the common path self-healing — but it
 * only runs when somebody tries to book. On a quiet business nobody does, so
 * the dead hold stays visible until the next attempt, which on a low-traffic
 * demo is the normal case rather than the edge case. The daily cron sweeps
 * every organization for that reason.
 */
const expired = () =>
  and(eq(bookings.status, "pending"), lt(bookings.expiresAt, sql`now()`));

async function release(where: ReturnType<typeof and>): Promise<number> {
  const released = await db
    .update(bookings)
    .set({ status: "cancelled", cancelledAt: sql`now()` })
    .where(where)
    .returning({ id: bookings.id });
  return released.length;
}

/** Sweep one organization — the lazy path, on the way into a booking. */
export function expireHoldsForOrg(organizationId: string): Promise<number> {
  return release(and(eq(bookings.organizationId, organizationId), expired()));
}

/** Sweep every organization — the daily cron. */
export function expireAllHolds(): Promise<number> {
  return release(expired());
}
