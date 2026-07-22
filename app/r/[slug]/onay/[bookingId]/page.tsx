import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getBusinessBySlug } from "@/lib/booking/get-available-slots";
import { db } from "@/lib/db";
import { bookings } from "@/lib/db/schema/booking-schema";
import { services } from "@/lib/db/schema/service-schema";
import { formatMoney } from "@/lib/format";

export const metadata = { title: "Randevu onayı" };

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

  const when = booking.startsAt.toLocaleString("tr-TR", {
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
          <h1 className="font-bold text-2xl">Randevunuz alındı! 🎉</h1>
          <p className="text-muted-foreground">
            {service?.name} — {business.orgName}
          </p>
          <p className="font-medium text-lg">{when}</p>
          <p className="text-muted-foreground text-sm">
            Onay e-postası {booking.customerEmail} adresine gönderildi.
          </p>
        </>
      )}
      {booking.status === "pending" && (
        <>
          <h1 className="font-bold text-2xl">Az kaldı…</h1>
          <p className="text-muted-foreground">
            {when} tarihindeki {service?.name} randevunuzun onaylanması için{" "}
            {booking.depositCents
              ? formatMoney(booking.depositCents, business.profile.currency)
              : ""}{" "}
            kapora ödemenizi bekliyoruz. Ödeme tamamlandığında bu sayfada onay
            görünecek.
          </p>
        </>
      )}
      {booking.status === "cancelled" && (
        <>
          <h1 className="font-bold text-2xl">Randevu iptal edildi</h1>
          <p className="text-muted-foreground">
            Bu randevu artık geçerli değil.
          </p>
        </>
      )}
      <Link
        href={`/r/${slug}`}
        className="text-muted-foreground text-sm underline underline-offset-4"
      >
        {business.orgName} sayfasına dön
      </Link>
    </main>
  );
}
