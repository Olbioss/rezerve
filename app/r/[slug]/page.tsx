import { and, asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { BookingShell } from "@/components/booking/booking-shell";
import { getBilling } from "@/lib/billing/get-billing";
import {
  getBusinessBySlug,
  getOpenWeekdays,
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

  const [rows, openWeekdays, billing] = await Promise.all([
    db.query.services.findMany({
      where: and(
        eq(services.organizationId, business.organizationId),
        eq(services.active, true)
      ),
      orderBy: [asc(services.createdAt)],
    }),
    getOpenWeekdays(business.organizationId),
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
