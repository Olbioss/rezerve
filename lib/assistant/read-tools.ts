import "server-only";
import { and, asc, eq, gt, or, sql } from "drizzle-orm";
import { getBilling } from "@/lib/billing/get-billing";
import { REFUND_NOTICE_HOURS } from "@/lib/booking/cancellation-policy";
import { getBookingForPage } from "@/lib/booking/confirmation";
import { expireHoldsForOrg } from "@/lib/booking/expire-holds";
import {
  getAvailableSlots,
  localDateISO,
} from "@/lib/booking/get-available-slots";
import { db } from "@/lib/db";
import { bookings } from "@/lib/db/schema/booking-schema";
import { services } from "@/lib/db/schema/service-schema";
import { localLabel, localTime } from "./format";
import type { AssistantIdentity } from "./identity";
import type {
  BookingView,
  BusinessInfo,
  FindSlotsInput,
  FindSlotsOutput,
  GetBookingInput,
  ListMyBookingsOutput,
  ListServicesOutput,
  Slot,
} from "./tool-definitions";
import { type ToolResult, toolError } from "./tool-result";

type Booking = typeof bookings.$inferSelect;

/** find_slots reads each day separately; two weeks is a dozen queries a day. */
const MAX_RANGE_DAYS = 14;
const DEFAULT_SLOT_LIMIT = 10;
/** A customer with more upcoming bookings than this calls the business. */
const MAX_LISTED_BOOKINGS = 20;

const DAY_MS = 86_400_000;
const dayNumber = (dateISO: string) => Date.parse(`${dateISO}T00:00:00Z`);
const addDays = (dateISO: string, days: number) =>
  new Date(dayNumber(dateISO) + days * DAY_MS).toISOString().slice(0, 10);

function bookingPageUrl(slug: string): string | null {
  try {
    return new URL(`/r/${slug}`, process.env.NEXT_PUBLIC_APP_URL).href;
  } catch {
    return null;
  }
}

function viewOf(
  booking: Booking,
  serviceName: string,
  timezone: string
): BookingView {
  return {
    id: booking.id,
    service_id: booking.serviceId,
    service_name: serviceName,
    starts_at: booking.startsAt.toISOString(),
    local_label: localLabel(booking.startsAt, timezone),
    status: booking.status,
    deposit_cents: booking.depositCents,
    paid: booking.paymentTransactionId !== null,
    hold_expires_at:
      booking.status === "pending" && booking.expiresAt
        ? booking.expiresAt.toISOString()
        : null,
    cancelled_at: booking.cancelledAt?.toISOString() ?? null,
    cancelled_by: booking.cancelledBy,
  };
}

export async function getBusinessInfo(
  { business }: AssistantIdentity,
  now: Date = new Date()
): Promise<ToolResult<BusinessInfo>> {
  const { profile } = business;
  const today = localDateISO(now, profile.timezone);
  return {
    ok: true,
    data: {
      name: business.orgName,
      timezone: profile.timezone,
      today,
      now_local: `${today}T${localTime(now, profile.timezone)}`,
      phone: profile.phone,
      address: profile.address,
      description: profile.description,
      assistant_notes: profile.assistantNotes,
      booking_window_days: profile.bookingWindowDays,
      min_lead_time_minutes: profile.minLeadTimeMinutes,
      refund_notice_hours: REFUND_NOTICE_HOURS,
      booking_page_url: bookingPageUrl(business.slug),
    },
  };
}

export async function listServices({
  business,
}: AssistantIdentity): Promise<ToolResult<ListServicesOutput>> {
  const [rows, billing] = await Promise.all([
    db.query.services.findMany({
      where: and(
        eq(services.organizationId, business.organizationId),
        eq(services.active, true)
      ),
      orderBy: [asc(services.name)],
    }),
    getBilling(business.organizationId),
  ]);
  return {
    ok: true,
    data: {
      services: rows.map((service) => ({
        id: service.id,
        name: service.name,
        description: service.description,
        duration_minutes: service.durationMinutes,
        price_cents: service.priceCents,
        // Only a kapora that will actually be collected: on a lapsed plan the
        // service keeps its stored amount, but create_booking charges none.
        deposit_cents:
          service.depositCents != null && billing.onlineDeposit
            ? service.depositCents
            : null,
        currency: business.profile.currency,
      })),
    },
  };
}

export async function findSlots(
  { business, customerRef }: AssistantIdentity,
  args: FindSlotsInput,
  now: Date = new Date()
): Promise<ToolResult<FindSlotsOutput>> {
  const days =
    (dayNumber(args.to_date) - dayNumber(args.from_date)) / DAY_MS + 1;
  if (days < 1) {
    return toolError(
      "invalid",
      "Bitiş tarihi başlangıç tarihinden önce olamaz."
    );
  }
  if (days > MAX_RANGE_DAYS) {
    return toolError(
      "range_too_long",
      "En fazla 14 günlük bir aralık sorulabilir."
    );
  }

  const service = await db.query.services.findFirst({
    where: and(
      eq(services.id, args.service_id),
      eq(services.organizationId, business.organizationId),
      eq(services.active, true)
    ),
  });
  if (!service) return toolError("not_found", "Hizmet bulunamadı");

  // Only the customer's own booking may be left out: anyone else's would
  // reveal when it is.
  const moving = args.rescheduling_booking_id;
  if (moving) {
    const found = await getBookingForPage(business.organizationId, moving);
    if (!found || found.booking.customerRef !== customerRef) {
      return toolError("not_found", "Randevu bulunamadı.");
    }
  }

  const { timezone } = business.profile;
  const limit = args.limit ?? DEFAULT_SLOT_LIMIT;
  const found: Slot[] = [];
  let truncated = false;
  for (let day = 0; day < days && !truncated; day += 1) {
    // Null for a date outside the booking window: simply nothing to offer.
    const starts =
      (await getAvailableSlots(
        business,
        service.id,
        addDays(args.from_date, day),
        now,
        { excludeBookingId: moving }
      )) ?? [];
    for (const start of starts) {
      const time = localTime(start, timezone);
      if (args.earliest_time && time < args.earliest_time) continue;
      if (args.latest_time && time > args.latest_time) continue;
      if (found.length === limit) {
        truncated = true;
        break;
      }
      found.push({
        starts_at: start.toISOString(),
        local_label: localLabel(start, timezone),
      });
    }
  }
  return { ok: true, data: { slots: found, truncated } };
}

export async function listMyBookings(
  { business, customerRef }: AssistantIdentity,
  now: Date = new Date()
): Promise<ToolResult<ListMyBookingsOutput>> {
  const rows = await db
    .select({ booking: bookings, serviceName: services.name })
    .from(bookings)
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .where(
      and(
        eq(bookings.organizationId, business.organizationId),
        eq(bookings.customerRef, customerRef),
        gt(bookings.startsAt, now),
        // Confirmed, or a hold still waiting for its kapora — the same rule
        // the slot lookup uses for what occupies a time.
        or(
          eq(bookings.status, "confirmed"),
          and(
            eq(bookings.status, "pending"),
            gt(bookings.expiresAt, sql`now()`)
          )
        )
      )
    )
    .orderBy(asc(bookings.startsAt))
    .limit(MAX_LISTED_BOOKINGS);
  return {
    ok: true,
    data: {
      bookings: rows.map((row) =>
        viewOf(row.booking, row.serviceName, business.profile.timezone)
      ),
    },
  };
}

export async function getBooking(
  { business, customerRef }: AssistantIdentity,
  args: GetBookingInput
): Promise<ToolResult<BookingView>> {
  // A hold whose kapora never came is released first, so it reads as the
  // slot lookup already treats it: gone, not "waiting for payment".
  await expireHoldsForOrg(business.organizationId);
  const found = await getBookingForPage(
    business.organizationId,
    args.booking_id
  );
  if (!found || found.booking.customerRef !== customerRef) {
    return toolError("not_found", "Randevu bulunamadı.");
  }
  return {
    ok: true,
    data: viewOf(
      found.booking,
      found.service?.name ?? "",
      business.profile.timezone
    ),
  };
}
