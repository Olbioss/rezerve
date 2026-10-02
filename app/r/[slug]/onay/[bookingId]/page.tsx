import { CalendarPlusIcon } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { BookingShell } from "@/components/booking/booking-shell";
import { buttonVariants } from "@/components/ui/button";
import {
  confirmationPath,
  confirmationUrl,
  getBookingForPage,
} from "@/lib/booking/confirmation";
import { getBusinessBySlug } from "@/lib/booking/get-available-slots";
import { bookingCalendarEvent } from "@/lib/calendar/booking-event";
import { googleCalendarUrl } from "@/lib/calendar/ics";
import { formatMoney } from "@/lib/format";
import { currentSlugFor } from "@/lib/slug-history";
import { BookingSkeleton } from "../../booking-skeleton";

export const metadata = { title: "Randevu onayı" };

/** Champagne ring that draws itself once on load. */
function Seal({ glyph }: { glyph: string }) {
  return (
    <span className="relative mx-auto flex size-24 items-center justify-center">
      <svg
        aria-hidden
        viewBox="0 0 100 100"
        className="absolute inset-0 size-full"
      >
        <circle
          cx="50"
          cy="50"
          r="48"
          fill="none"
          stroke="var(--brand)"
          strokeWidth="1"
          className="ring-draw"
          transform="rotate(-90 50 50)"
        />
      </svg>
      <span className="font-display text-4xl text-brand-ink">{glyph}</span>
    </span>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-border/70 border-t py-3 text-left">
      <span className="eyebrow text-muted-foreground">{label}</span>
      <span className="font-medium text-sm">{value}</span>
    </div>
  );
}

export default function ConfirmationPage({
  params,
}: {
  params: Promise<{ slug: string; bookingId: string }>;
}) {
  return (
    <Suspense fallback={<BookingSkeleton compact />}>
      <Confirmation params={params} />
    </Suspense>
  );
}

async function Confirmation({
  params,
}: {
  params: Promise<{ slug: string; bookingId: string }>;
}) {
  const { slug, bookingId } = await params;
  const business = await getBusinessBySlug(slug);
  if (!business) {
    // The link in a confirmation email predates a move of the address.
    const moved = await currentSlugFor(slug);
    if (moved) redirect(confirmationPath(moved, bookingId));
    notFound();
  }
  const found = await getBookingForPage(business.organizationId, bookingId);
  if (!found) notFound();
  const { booking, service } = found;

  const when = booking.startsAt.toLocaleString("tr-TR", {
    timeZone: business.profile.timezone,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const deposit = booking.depositCents
    ? formatMoney(booking.depositCents, business.profile.currency)
    : null;

  const calendarEvent = bookingCalendarEvent({
    id: booking.id,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    businessName: business.orgName,
    serviceName: service?.name ?? "Randevu",
    address: business.profile.address,
    phone: business.profile.phone,
    url: confirmationUrl(slug, booking.id),
  });

  return (
    <BookingShell
      businessName={business.orgName}
      phone={business.profile.phone}
      address={business.profile.address}
      compact
    >
      <div className="rise text-center">
        {booking.status === "confirmed" && (
          <>
            <Seal glyph="✓" />
            <h2 className="mt-7 font-display text-4xl leading-none">
              Randevunuz <em className="text-brand-ink">alındı.</em>
            </h2>
            <p className="mt-4 text-muted-foreground text-sm">
              Onay e-postası{" "}
              <strong className="text-foreground">
                {booking.customerEmail}
              </strong>{" "}
              adresine gönderildi.
            </p>
            <div className="mt-8">
              <Row label="Hizmet" value={service?.name ?? "—"} />
              <Row label="Ne zaman" value={when} />
              {deposit && (
                <Row
                  label="Kapora"
                  value={
                    <span className="text-brand-ink">{deposit} ödendi</span>
                  }
                />
              )}
            </div>
            <div className="mt-8 grid justify-items-center gap-3">
              <p className="eyebrow text-muted-foreground">Takvime ekleyin</p>
              {/* Links, not buttons: one opens Google, one downloads a file. */}
              <div className="flex flex-wrap justify-center gap-2">
                <a
                  href={googleCalendarUrl(calendarEvent)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  <CalendarPlusIcon />
                  Google Takvim
                </a>
                <a
                  href={`${confirmationPath(slug, booking.id)}/takvim`}
                  download="randevu.ics"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  <CalendarPlusIcon />
                  Apple · Outlook (.ics)
                </a>
              </div>
            </div>
          </>
        )}

        {booking.status === "pending" && (
          <>
            <Seal glyph="·" />
            <h2 className="mt-7 font-display text-4xl leading-none">
              Az <em className="text-brand-ink">kaldı.</em>
            </h2>
            <p className="mx-auto mt-4 max-w-sm text-muted-foreground text-sm">
              {deposit ? `${deposit} kapora` : "Kapora"} ödemeniz
              tamamlandığında randevunuz onaylanacak ve bu sayfada görünecek.
              Saat 30 dakika sizin için tutuluyor.
            </p>
            <div className="mt-8">
              <Row label="Hizmet" value={service?.name ?? "—"} />
              <Row label="Ne zaman" value={when} />
            </div>
          </>
        )}

        {booking.status === "cancelled" && (
          <>
            <Seal glyph="×" />
            <h2 className="mt-7 font-display text-4xl leading-none">
              Randevu <em className="text-muted-foreground">iptal edildi.</em>
            </h2>
            <p className="mt-4 text-muted-foreground text-sm">
              {booking.depositRefundedAt
                ? "Bu randevu artık geçerli değil. Ödediğiniz kapora kartınıza iade edildi — bankanıza göre birkaç iş günü sürebilir. Dilerseniz yeni bir saat seçebilirsiniz."
                : "Bu randevu artık geçerli değil. Dilerseniz yeni bir saat seçebilirsiniz."}
            </p>
          </>
        )}

        <Link
          href={`/r/${slug}`}
          className="underline-draw eyebrow mt-10 inline-block text-muted-foreground transition-colors hover:text-brand-ink"
        >
          {business.orgName} sayfasına dön
        </Link>
      </div>
    </BookingShell>
  );
}
