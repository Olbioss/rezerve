import { and, asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getBusinessBySlug } from "@/lib/booking/get-available-slots";
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

  const rows = await db.query.services.findMany({
    where: and(
      eq(services.organizationId, business.organizationId),
      eq(services.active, true)
    ),
    orderBy: [asc(services.createdAt)],
  });

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <div className="mb-8 text-center">
        <h1 className="font-bold text-3xl tracking-tight">
          {business.orgName}
        </h1>
        <p className="mt-1 text-muted-foreground">Randevu alın</p>
      </div>
      <BookingFlow
        slug={slug}
        timezone={business.profile.timezone}
        bookingWindowDays={business.profile.bookingWindowDays}
        currency={business.profile.currency}
        services={rows.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          durationMinutes: s.durationMinutes,
          priceCents: s.priceCents,
          depositCents: s.depositCents,
        }))}
      />
    </main>
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
