import "server-only";
import { TZDate } from "@date-fns/tz";
import { and, eq, gt, lt, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { organization } from "@/lib/db/schema/auth-schema";
import { availabilityRules } from "@/lib/db/schema/availability-schema";
import { bookings } from "@/lib/db/schema/booking-schema";
import { businessProfiles } from "@/lib/db/schema/business-schema";
import { services } from "@/lib/db/schema/service-schema";
import { computeSlotsForDay } from "./slots";

export type BusinessContext = {
  organizationId: string;
  orgName: string;
  slug: string;
  profile: typeof businessProfiles.$inferSelect;
};

/** Resolve a public booking-page slug to its business, or null. */
export async function getBusinessBySlug(
  slug: string
): Promise<BusinessContext | null> {
  const org = await db.query.organization.findFirst({
    where: eq(organization.slug, slug),
  });
  if (!org) return null;
  const profile = await db.query.businessProfiles.findFirst({
    where: eq(businessProfiles.organizationId, org.id),
  });
  if (!profile) return null;
  return { organizationId: org.id, orgName: org.name, slug, profile };
}

const DATE_ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Local "today" for a timezone as YYYY-MM-DD. */
export function localDateISO(instant: Date, timezone: string): string {
  const tz = new TZDate(instant, timezone);
  const y = tz.getFullYear();
  const m = String(tz.getMonth() + 1).padStart(2, "0");
  const d = String(tz.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Available UTC slot starts for one local business day.
 * Returns null when the request is invalid (unknown service, date out of
 * booking window, malformed date).
 */
export async function getAvailableSlots(
  business: BusinessContext,
  serviceId: string,
  dateISO: string,
  now: Date = new Date()
): Promise<Date[] | null> {
  if (!DATE_ISO_RE.test(dateISO)) return null;
  const { organizationId, profile } = business;

  const service = await db.query.services.findFirst({
    where: and(
      eq(services.id, serviceId),
      eq(services.organizationId, organizationId),
      eq(services.active, true)
    ),
  });
  if (!service) return null;

  // Enforce the booking window in business-local days.
  const todayISO = localDateISO(now, profile.timezone);
  const lastISO = localDateISO(
    new Date(now.getTime() + profile.bookingWindowDays * 86_400_000),
    profile.timezone
  );
  if (dateISO < todayISO || dateISO > lastISO) return null;

  const rules = await db.query.availabilityRules.findMany({
    where: eq(availabilityRules.organizationId, organizationId),
  });

  // Bookings that could overlap the local day: query a ±1-day UTC window.
  const [year, month, day] = dateISO.split("-").map(Number);
  const dayStartUtc = new Date(
    new TZDate(year, month - 1, day, profile.timezone).getTime()
  );
  const windowStart = new Date(dayStartUtc.getTime() - 86_400_000);
  const windowEnd = new Date(dayStartUtc.getTime() + 2 * 86_400_000);

  const existing = await db
    .select({ startsAt: bookings.startsAt, endsAt: bookings.endsAt })
    .from(bookings)
    .where(
      and(
        eq(bookings.organizationId, organizationId),
        gt(bookings.endsAt, windowStart),
        lt(bookings.startsAt, windowEnd),
        or(
          eq(bookings.status, "confirmed"),
          and(
            eq(bookings.status, "pending"),
            gt(bookings.expiresAt, sql`now()`)
          )
        )
      )
    );

  return computeSlotsForDay({
    dateISO,
    timezone: profile.timezone,
    rules,
    durationMinutes: service.durationMinutes,
    granularityMinutes: profile.slotGranularityMinutes,
    existingBookings: existing,
    now,
    minLeadTimeMinutes: profile.minLeadTimeMinutes,
  });
}
