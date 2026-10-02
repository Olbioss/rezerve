import { and, asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
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
import { currentSlugFor } from "@/lib/slug-history";
import { BookingFlow } from "./booking-flow";
import { BookingSkeleton } from "./booking-skeleton";

/**
 * Everything on this page belongs to one business, so its static shell is
 * only the frame; the business streams in. Inside that boundary a missing
 * business is a 200 marked noindex rather than a 404, and an old address
 * redirects from the browser — the price of partial prerendering, accepted
 * for the instant first paint.
 */
export default function BookingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <Suspense fallback={<BookingSkeleton />}>
      <Booking params={params} />
    </Suspense>
  );
}

async function Booking({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const business = await getBusinessBySlug(slug);
  if (!business) {
    // An address the business moved away from still leads to it. Temporary,
    // not permanent: the business may move back, and a browser that cached
    // a permanent redirect would then bounce between the two addresses.
    const moved = await currentSlugFor(slug);
    if (moved) redirect(`/r/${moved}`);
    notFound();
  }

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

/**
 * What a shared link previews as. Businesses post this address on Instagram
 * and in messages, so the preview names the business and says what it does,
 * with its own card from opengraph-image.tsx beside it. An old address
 * previews as the business it now leads to: link previewers read these tags
 * and never run the browser-side redirect. An unknown slug gets nothing here;
 * its not-found page supplies the title.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug: requested } = await params;
  const found = await getBusinessBySlug(requested);
  const slug = found ? requested : await currentSlugFor(requested);
  const business = found ?? (slug ? await getBusinessBySlug(slug) : null);
  if (!business || !slug) return {};
  const title = `${business.orgName} — Randevu`;
  const description =
    business.profile.description ??
    `${business.orgName} için online randevu alın.`;
  return {
    title,
    description,
    alternates: { canonical: `/r/${slug}` },
    openGraph: {
      title,
      description,
      url: `/r/${slug}`,
      siteName: "Rezerve",
      locale: "tr_TR",
      type: "website",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}
