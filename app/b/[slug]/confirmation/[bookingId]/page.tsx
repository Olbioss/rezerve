import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getBusinessBySlug } from "@/lib/booking/get-available-slots";
import { db } from "@/lib/db";
import { bookings } from "@/lib/db/schema/booking-schema";
import { services } from "@/lib/db/schema/service-schema";
import { formatMoney } from "@/lib/format";

export const metadata = { title: "Booking confirmation" };

export default async function ConfirmationPage({
  params,
}: {
  params: Promise<{ slug: string; bookingId: string }>;
}) {
  const { slug, bookingId } = await params;
  const business = await getBusinessBySlug(slug);
  if (!business) notFound();

  const booking = await db.query.bookings.findFirst({
    where: and(
      eq(bookings.id, bookingId),
      eq(bookings.organizationId, business.organizationId)
    ),
  });
  if (!booking) notFound();

  const service = await db.query.services.findFirst({
    where: eq(services.id, booking.serviceId),
  });

  const when = booking.startsAt.toLocaleString("en-US", {
    timeZone: business.profile.timezone,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-10 text-center">
      {booking.status === "confirmed" && (
        <>
          <h1 className="font-bold text-2xl">You're booked! 🎉</h1>
          <p className="text-muted-foreground">
            {service?.name} at {business.orgName}
          </p>
          <p className="font-medium text-lg">{when}</p>
          <p className="text-muted-foreground text-sm">
            A confirmation email is on its way to {booking.customerEmail}.
          </p>
        </>
      )}
      {booking.status === "pending" && (
        <>
          <h1 className="font-bold text-2xl">Almost there…</h1>
          <p className="text-muted-foreground">
            We're waiting for your{" "}
            {booking.depositCents
              ? formatMoney(booking.depositCents, business.profile.currency)
              : ""}{" "}
            deposit payment to confirm {service?.name} on {when}. This page will
            show the confirmed status once payment completes.
          </p>
        </>
      )}
      {booking.status === "cancelled" && (
        <>
          <h1 className="font-bold text-2xl">Booking cancelled</h1>
          <p className="text-muted-foreground">
            This booking is no longer active.
          </p>
        </>
      )}
      <Link
        href={`/b/${slug}`}
        className="text-muted-foreground text-sm underline underline-offset-4"
      >
        Back to {business.orgName}
      </Link>
    </main>
  );
}
