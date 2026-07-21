import { and, asc, count, eq, gte, inArray, lt } from "drizzle-orm";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOwner } from "@/lib/auth-guard";
import { db } from "@/lib/db";
import { bookings } from "@/lib/db/schema/booking-schema";
import { services } from "@/lib/db/schema/service-schema";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { session, organizationId, profile } = await requireOwner();
  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * 86_400_000);

  const [next, [{ value: weekCount }], [{ value: serviceCount }]] =
    await Promise.all([
      db
        .select({
          id: bookings.id,
          customerName: bookings.customerName,
          startsAt: bookings.startsAt,
          status: bookings.status,
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
        .where(
          and(
            eq(bookings.organizationId, organizationId),
            gte(bookings.startsAt, now),
            lt(bookings.startsAt, weekAhead),
            eq(bookings.status, "confirmed")
          )
        ),
      db
        .select({ value: count() })
        .from(services)
        .where(
          and(
            eq(services.organizationId, organizationId),
            eq(services.active, true)
          )
        ),
    ]);

  function formatWhen(date: Date) {
    return date.toLocaleString("en-US", {
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
    <div className="grid gap-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">
          Welcome, {session.user.name}
        </h1>
        <p className="text-muted-foreground">
          {weekCount} confirmed booking{weekCount === 1 ? "" : "s"} in the next
          7 days · {serviceCount} active service
          {serviceCount === 1 ? "" : "s"}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Next up</CardTitle>
        </CardHeader>
        <CardContent>
          {next.length === 0 ? (
            <p className="text-muted-foreground">
              No upcoming bookings.{" "}
              <Link
                href="/dashboard/services"
                className="underline underline-offset-4"
              >
                Add services
              </Link>{" "}
              and share your booking page to get started.
            </p>
          ) : (
            <ul className="grid gap-3">
              {next.map((booking) => (
                <li
                  key={booking.id}
                  className="flex items-center justify-between gap-4"
                >
                  <div>
                    <p className="font-medium">
                      {booking.serviceName} — {booking.customerName}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      {formatWhen(booking.startsAt)}
                      {booking.status === "pending"
                        ? " · awaiting deposit"
                        : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
