import { and, asc, desc, eq, gte, lt } from "drizzle-orm";
import { PageHeader } from "@/components/panel/page-header";
import { requireOwner } from "@/lib/auth-guard";
import { db } from "@/lib/db";
import { bookings } from "@/lib/db/schema/booking-schema";
import { services } from "@/lib/db/schema/service-schema";
import { type BookingRow, BookingsList } from "./bookings-list";

export const metadata = { title: "Randevular" };

async function loadBookings(
  organizationId: string,
  which: "upcoming" | "past"
): Promise<BookingRow[]> {
  const now = new Date();
  const rows = await db
    .select({
      id: bookings.id,
      customerName: bookings.customerName,
      customerEmail: bookings.customerEmail,
      startsAt: bookings.startsAt,
      status: bookings.status,
      depositCents: bookings.depositCents,
      serviceName: services.name,
    })
    .from(bookings)
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .where(
      and(
        eq(bookings.organizationId, organizationId),
        which === "upcoming"
          ? gte(bookings.startsAt, now)
          : lt(bookings.startsAt, now)
      )
    )
    .orderBy(
      which === "upcoming" ? asc(bookings.startsAt) : desc(bookings.startsAt)
    )
    .limit(100);
  return rows.map((row) => ({
    ...row,
    startsAtISO: row.startsAt.toISOString(),
  }));
}

export default async function BookingsPage() {
  const { organizationId, profile } = await requireOwner();
  const [upcoming, past] = await Promise.all([
    loadBookings(organizationId, "upcoming"),
    loadBookings(organizationId, "past"),
  ]);

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Randevular"
        description={`Saatler ${profile.timezone} saat dilimindedir.`}
      />
      <BookingsList
        upcoming={upcoming}
        past={past}
        timezone={profile.timezone}
        currency={profile.currency}
      />
    </div>
  );
}
