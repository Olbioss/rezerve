import "server-only";
import { and, desc, eq, gte, isNotNull, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings } from "@/lib/db/schema/booking-schema";
import { services } from "@/lib/db/schema/service-schema";
import { retrievePaymentDetails } from "@/lib/payments/iyzico";
import {
  type IyzicoPaymentDetail,
  type PayoutRow,
  toPayoutRow,
} from "./payouts";

/** One iyzico round trip per booking, so breadth costs round trips. */
export const MAX_BOOKINGS_CHECKED = 40;
const CONCURRENCY = 5;

async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    results.push(...(await Promise.all(items.slice(i, i + limit).map(fn))));
  }
  return results;
}

export type Payouts = {
  /** Newest payment first. */
  rows: PayoutRow[];
  /** Bookings iyzico could not be asked about on this load. */
  failed: number;
  /** More deposit bookings in the window than were checked. */
  truncated: boolean;
};

/**
 * This organization's kapora over a window.
 *
 * The bookings query is the security boundary: it is scoped to the
 * organization, and every row comes from asking iyzico about one of those
 * bookings by its own id — see lib/panel/payouts.ts.
 *
 * A failed lookup costs that booking, not the page. iyzico's reporting fails
 * intermittently ("Sistem hatası"), and one bad answer blanking every row is
 * what the old day-by-day listing did.
 */
export async function getPayouts(
  organizationId: string,
  windowDays: number
): Promise<Payouts> {
  const since = new Date(Date.now() - windowDays * 86_400_000);

  const owned = await db
    .select({
      id: bookings.id,
      customerName: bookings.customerName,
      serviceName: services.name,
      startsAt: bookings.startsAt,
      refundedAt: bookings.depositRefundedAt,
    })
    .from(bookings)
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .where(
      and(
        eq(bookings.organizationId, organizationId),
        // Only a deposit booking ever opened an iyzico checkout.
        isNotNull(bookings.paymentToken),
        gte(bookings.createdAt, since),
        lte(bookings.createdAt, new Date())
      )
    )
    // A deposit is paid inside the 30-minute hold, so creation order is
    // payment order.
    .orderBy(desc(bookings.createdAt))
    .limit(MAX_BOOKINGS_CHECKED + 1);

  const results = await mapWithLimit(
    owned.slice(0, MAX_BOOKINGS_CHECKED),
    CONCURRENCY,
    async (booking) => {
      try {
        const payments = await retrievePaymentDetails(booking.id);
        return toPayoutRow(booking, payments as IyzicoPaymentDetail[]);
      } catch (err) {
        console.error(`Payout details failed for booking ${booking.id}:`, err);
        return "failed" as const;
      }
    }
  );

  return {
    rows: results.filter(
      (result): result is PayoutRow => result !== null && result !== "failed"
    ),
    failed: results.filter((result) => result === "failed").length,
    truncated: owned.length > MAX_BOOKINGS_CHECKED,
  };
}
