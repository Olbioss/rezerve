import "server-only";
import { and, eq, gte, isNotNull, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings } from "@/lib/db/schema/booking-schema";
import { services } from "@/lib/db/schema/service-schema";
import { listTransactions } from "@/lib/payments/iyzico";
import {
  type IyzicoTransaction,
  matchTransactions,
  type OwnedBooking,
  type PayoutRow,
} from "./payouts";

/** iyzico reports one calendar day per call, so breadth costs round trips. */
const MAX_DAYS_FETCHED = 20;
const CONCURRENCY = 5;

/** YYYY-MM-DD in UTC, matching how iyzico indexes a reporting day. */
export function dayKey(at: Date): string {
  return at.toISOString().slice(0, 10);
}

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

/**
 * This organization's settled kapora over a window, newest first.
 *
 * The bookings query is the security boundary: it is scoped to the
 * organization, and matchTransactions can only return rows whose basketId
 * appears in it. iyzico's reporting is platform-wide and carries no
 * submerchant id, so its response is treated as untrusted input that contains
 * every other business on the platform — because it does.
 *
 * It also decides *which* days to ask about. iyzico reports one day per call,
 * so a blind 30-day window would be 30 round trips; asking only about days
 * this organization actually took a deposit usually makes that a handful.
 */
export async function getPayouts(
  organizationId: string,
  windowDays: number
): Promise<{ rows: PayoutRow[]; error: string | null; daysFetched: number }> {
  const since = new Date(Date.now() - windowDays * 86_400_000);

  const owned = await db
    .select({
      id: bookings.id,
      customerName: bookings.customerName,
      serviceName: services.name,
      startsAt: bookings.startsAt,
      refundedAt: bookings.depositRefundedAt,
      createdAt: bookings.createdAt,
    })
    .from(bookings)
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .where(
      and(
        eq(bookings.organizationId, organizationId),
        // Only deposit bookings ever appear in settlement reporting.
        isNotNull(bookings.paymentToken),
        gte(bookings.createdAt, since),
        lte(bookings.createdAt, new Date())
      )
    );

  if (owned.length === 0) {
    return { rows: [], error: null, daysFetched: 0 };
  }

  // A deposit is paid inside the 30-minute hold, so payment day and creation
  // day coincide — but a hold opened near midnight can settle on either side.
  const days = new Set<string>();
  for (const booking of owned) {
    days.add(dayKey(booking.createdAt));
    days.add(dayKey(new Date(booking.createdAt.getTime() + 86_400_000)));
  }
  const wanted = [...days].sort().reverse().slice(0, MAX_DAYS_FETCHED);

  let transactions: IyzicoTransaction[];
  try {
    const pages = await mapWithLimit(wanted, CONCURRENCY, (day) =>
      listTransactions(day)
    );
    transactions = pages.flat() as IyzicoTransaction[];
  } catch (err) {
    console.error("Payout reporting failed:", err);
    return {
      rows: [],
      error: "Ödeme raporu şu anda alınamadı.",
      daysFetched: 0,
    };
  }

  const ownedById = new Map<string, OwnedBooking>(
    owned.map((booking) => [booking.id, booking])
  );
  return {
    rows: matchTransactions(transactions, ownedById),
    error: null,
    daysFetched: wanted.length,
  };
}
