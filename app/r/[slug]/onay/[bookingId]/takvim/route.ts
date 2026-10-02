import {
  confirmationPath,
  getBookingForPage,
} from "@/lib/booking/confirmation";
import { getBusinessBySlug } from "@/lib/booking/get-available-slots";
import { bookingCalendarEvent } from "@/lib/calendar/booking-event";
import { bookingIcs } from "@/lib/calendar/ics";
import { currentSlugFor } from "@/lib/slug-history";

/**
 * The booking as an .ics file, linked from its confirmation page. Same lookup
 * as the page — the booking's uuid is the credential — and only a confirmed
 * booking has an appointment to put in a calendar.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string; bookingId: string }> }
) {
  const { slug, bookingId } = await params;
  const business = await getBusinessBySlug(slug);
  if (!business) {
    const moved = await currentSlugFor(slug);
    if (moved) {
      const path = `${confirmationPath(moved, bookingId)}/takvim`;
      return Response.redirect(new URL(path, request.url), 307);
    }
  }
  const found = business
    ? await getBookingForPage(business.organizationId, bookingId)
    : null;
  if (!business || !found || found.booking.status !== "confirmed") {
    return new Response("Randevu bulunamadı.", { status: 404 });
  }

  const ics = bookingIcs(
    bookingCalendarEvent({
      id: found.booking.id,
      startsAt: found.booking.startsAt,
      endsAt: found.booking.endsAt,
      businessName: business.orgName,
      serviceName: found.service?.name ?? "Randevu",
      address: business.profile.address,
      phone: business.profile.phone,
      url: new URL(confirmationPath(slug, bookingId), request.url).href,
    })
  );

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="randevu.ics"',
      "Cache-Control": "private, no-store",
    },
  });
}
