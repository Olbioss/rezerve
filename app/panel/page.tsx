import { and, asc, count, eq, gte, inArray, lt, sum } from "drizzle-orm";
import Link from "next/link";
import { EmptyState } from "@/components/panel/empty-state";
import { PageHeader } from "@/components/panel/page-header";
import { StatTile } from "@/components/panel/stat-tile";
import { StatusBadge } from "@/components/panel/status-badge";
import { Button } from "@/components/ui/button";
import { requireOwner } from "@/lib/auth-guard";
import { db } from "@/lib/db";
import { bookings } from "@/lib/db/schema/booking-schema";
import { services } from "@/lib/db/schema/service-schema";
import { formatMoney } from "@/lib/format";

export const metadata = { title: "Genel Bakış" };

export default async function DashboardPage() {
  const { session, organizationId, profile } = await requireOwner();
  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * 86_400_000);
  const inWeek = and(
    eq(bookings.organizationId, organizationId),
    gte(bookings.startsAt, now),
    lt(bookings.startsAt, weekAhead)
  );

  const [
    next,
    [{ value: weekCount }],
    [{ value: serviceCount }],
    [{ value: depositSum }],
    [{ value: pendingCount }],
  ] = await Promise.all([
    db
      .select({
        id: bookings.id,
        customerName: bookings.customerName,
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
          gte(bookings.startsAt, now),
          inArray(bookings.status, ["confirmed", "pending"])
        )
      )
      .orderBy(asc(bookings.startsAt))
      .limit(5),
    db
      .select({ value: count() })
      .from(bookings)
      .where(and(inWeek, eq(bookings.status, "confirmed"))),
    db
      .select({ value: count() })
      .from(services)
      .where(
        and(
          eq(services.organizationId, organizationId),
          eq(services.active, true)
        )
      ),
    db
      .select({ value: sum(bookings.depositCents) })
      .from(bookings)
      .where(and(inWeek, eq(bookings.status, "confirmed"))),
    db
      .select({ value: count() })
      .from(bookings)
      .where(and(inWeek, eq(bookings.status, "pending"))),
  ]);

  function formatWhen(date: Date) {
    return date.toLocaleString("tr-TR", {
      timeZone: profile.timezone,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  return (
    <div className="grid gap-8">
      <PageHeader
        title={
          <>
            Hoş geldiniz,{" "}
            <em className="text-brand-ink">{session.user.name}</em>
          </>
        }
        description={`Saatler ${profile.timezone} saat dilimindedir.`}
        action={
          <Button variant="outline" render={<Link href="/panel/randevular" />}>
            Tüm randevular
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Bu hafta randevu"
          value={weekCount}
          detail={
            pendingCount > 0
              ? `${pendingCount} randevu kapora bekliyor`
              : "Tümü onaylı"
          }
        />
        <StatTile
          label="Toplanan kapora"
          value={formatMoney(Number(depositSum ?? 0), profile.currency)}
          detail="Önümüzdeki 7 gün"
        />
        <StatTile
          label="Aktif hizmet"
          value={serviceCount}
          detail="Randevu sayfanızda görünür"
        />
      </div>

      <section className="grid gap-4">
        <h2 className="font-display text-2xl">Sıradaki randevular</h2>
        {next.length === 0 ? (
          <EmptyState title="Yaklaşan randevu yok.">
            <Link
              href="/panel/hizmetler"
              className="text-brand-ink underline underline-offset-4"
            >
              Hizmet ekleyin
            </Link>{" "}
            ve randevu sayfanızı paylaşarak başlayın.
          </EmptyState>
        ) : (
          <ul className="grid">
            {next.map((booking) => (
              <li
                key={booking.id}
                className="flex items-center justify-between gap-4 border-border border-b py-4 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {booking.serviceName}{" "}
                    <span className="text-muted-foreground">
                      — {booking.customerName}
                    </span>
                  </p>
                  <p className="numeral mt-1 text-muted-foreground text-sm">
                    {formatWhen(booking.startsAt)}
                    {booking.depositCents
                      ? ` · ${formatMoney(booking.depositCents, profile.currency)} kapora`
                      : ""}
                  </p>
                </div>
                <StatusBadge status={booking.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
