import "server-only";
import { and, eq, gte, isNotNull, lt } from "drizzle-orm";
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

const DAY_MS = 86_400_000;

/**
 * This organization's settled kapora for one day.
 *
 * The bookings query is the security boundary: it is scoped to the
 * organization, and matchTransactions can only return rows whose basketId
 * appears in it. iyzico's response is treated as untrusted input that may
 * contain every other business on the platform — because it does.
 */
export async function getPayouts(
  organizationId: string,
  dateISO: string
): Promise<{ rows: PayoutRow[]; error: string | null }> {
  const day = new Date(`${dateISO}T00:00:00Z`);
  if (Number.isNaN(day.getTime())) return { rows: [], error: "Geçersiz tarih" };

  // A deposit is paid within the 30-minute hold, so the booking was created
  // the same day; ±1 day absorbs any timezone skew in iyzico's reporting.
  const owned = await db
    .select({
      id: bookings.id,
      customerName: bookings.customerName,
      serviceName: services.name,
      startsAt: bookings.startsAt,
    })
    .from(bookings)
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .where(
      and(
        eq(bookings.organizationId, organizationId),
        isNotNull(bookings.paymentToken),
        gte(bookings.createdAt, new Date(day.getTime() - DAY_MS)),
        lt(bookings.createdAt, new Date(day.getTime() + 2 * DAY_MS))
      )
    );

  if (owned.length === 0) return { rows: [], error: null };

  let transactions: IyzicoTransaction[];
  try {
    transactions = (await listTransactions(dateISO)) as IyzicoTransaction[];
  } catch (err) {
    console.error("Payout reporting failed:", err);
    return { rows: [], error: "Ödeme raporu şu anda alınamadı." };
  }

  const ownedById = new Map<string, OwnedBooking>(
    owned.map((booking) => [booking.id, booking])
  );
  return { rows: matchTransactions(transactions, ownedById), error: null };
}
