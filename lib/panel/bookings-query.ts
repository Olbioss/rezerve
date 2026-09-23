import "server-only";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  lt,
  or,
  type SQL,
} from "drizzle-orm";
import type { BookingStatus } from "@/components/panel/status-badge";
import { db } from "@/lib/db";
import { bookings } from "@/lib/db/schema/booking-schema";
import { services } from "@/lib/db/schema/service-schema";

/**
 * The bookings list used to load both tabs in full behind a hard
 * .limit(100), with no way to find one customer — fine for a new business,
 * useless for one with history, and silently lossy at the hundred-and-first
 * booking.
 *
 * Tab, page and search live in the URL, so a particular view can be linked,
 * reloaded and shared, and the navigation needs no JavaScript.
 */
export const PAGE_SIZE = 25;

export type Tab = "upcoming" | "past";

export type BookingRow = {
  id: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  startsAtISO: string;
  status: BookingStatus;
  depositCents: number | null;
  /** Set once the kapora has been returned to the customer. */
  depositRefunded: boolean;
  serviceName: string;
};

/**
 * `now` is a parameter rather than read inside, so the upcoming/past split is
 * testable at a chosen instant and both counts on one page agree with the
 * rows beneath them.
 */
function filterFor(
  organizationId: string,
  tab: Tab,
  query: string,
  now: Date
): SQL | undefined {
  const search = query
    ? or(
        ilike(bookings.customerName, `%${query}%`),
        ilike(bookings.customerEmail, `%${query}%`),
        ilike(bookings.customerPhone, `%${query}%`),
        ilike(services.name, `%${query}%`)
      )
    : undefined;

  return and(
    eq(bookings.organizationId, organizationId),
    tab === "upcoming"
      ? gte(bookings.startsAt, now)
      : lt(bookings.startsAt, now),
    search
  );
}

export async function countBookings(
  organizationId: string,
  tab: Tab,
  query: string,
  now: Date
): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(bookings)
    // Joined even to count, because the search reaches service names.
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .where(filterFor(organizationId, tab, query, now));
  return row?.n ?? 0;
}

export async function loadBookings(
  organizationId: string,
  tab: Tab,
  query: string,
  page: number,
  now: Date
): Promise<BookingRow[]> {
  const rows = await db
    .select({
      id: bookings.id,
      customerName: bookings.customerName,
      customerEmail: bookings.customerEmail,
      customerPhone: bookings.customerPhone,
      startsAt: bookings.startsAt,
      status: bookings.status,
      depositCents: bookings.depositCents,
      depositRefundedAt: bookings.depositRefundedAt,
      serviceName: services.name,
    })
    .from(bookings)
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .where(filterFor(organizationId, tab, query, now))
    .orderBy(
      tab === "upcoming" ? asc(bookings.startsAt) : desc(bookings.startsAt)
    )
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  return rows.map(({ depositRefundedAt, ...row }) => ({
    ...row,
    startsAtISO: row.startsAt.toISOString(),
    depositRefunded: depositRefundedAt !== null,
  }));
}
