import { and, asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { BookingShell } from "@/components/booking/booking-shell";
import { getBilling } from "@/lib/billing/get-billing";
import { dateOverrides } from "@/lib/booking/exceptions";
import {
  getBusinessBySlug,
  getDateExceptions,
  getOpenWeekdays,
  localDateISO,
} from "@/lib/booking/get-available-slots";
import { db } from "@/lib/db";
import { services } from "@/lib/db/schema/service-schema";
import { BookingFlow } from "./booking-flow";

export default async function BookingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const business = await getBusinessBySlug(slug);
  if (!business) notFound();

  // The same dates the booking page's strip shows, in the business's own
  // calendar, so a holiday greys out and a one-off opening lights up.
  const { timezone, bookingWindowDays } = business.profile;
  const stripDays = Array.from(
    { length: Math.min(bookingWindowDays, 30) },
    (_, i) => localDateISO(new Date(Date.now() + i * 86_400_000), timezone)
  );

  const [rows, openWeekdays, exceptions, billing] = await Promise.all([
    db.query.services.findMany({
      where: and(
        eq(services.organizationId, business.organizationId),
        eq(services.active, true)
      ),
      orderBy: [asc(services.createdAt)],
    }),
    getOpenWeekdays(business.organizationId),
    getDateExceptions(
      business.organizationId,
      stripDays[0],
      stripDays[stripDays.length - 1]
    ),
    getBilling(business.organizationId),
  ]);

  return (
    <BookingShell
      businessName={business.orgName}
      tagline={`Randevu alın · ${rows.length} hizmet`}
      description={business.profile.description}
      phone={business.profile.phone}
      address={business.profile.address}
    >
      <BookingFlow
        slug={slug}
        timezone={business.profile.timezone}
        bookingWindowDays={business.profile.bookingWindowDays}
        currency={business.profile.currency}
        openWeekdays={openWeekdays}
        dateOverrides={dateOverrides(exceptions, stripDays)}
        services={rows.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          durationMinutes: s.durationMinutes,
          priceCents: s.priceCents,
          // Gated here so the service card, the summary and the submit
          // label can't advertise a kapora that createBooking won't collect.
          depositCents: billing.onlineDeposit ? s.depositCents : null,
        }))}
      />
    </BookingShell>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const business = await getBusinessBySlug(slug);
  return {
    title: business ? `${business.orgName} — Randevu` : "Bulunamadı",
  };
}
