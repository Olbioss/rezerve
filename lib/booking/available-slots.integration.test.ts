/**
 * The slot lookup's one option: leaving a booking out of the busy times, so
 * a booking being moved is not refused by its own current time.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { organization } from "@/lib/db/schema/auth-schema";
import { availabilityRules } from "@/lib/db/schema/availability-schema";
import { bookings } from "@/lib/db/schema/booking-schema";
import { businessProfiles } from "@/lib/db/schema/business-schema";
import { services } from "@/lib/db/schema/service-schema";
import {
  type BusinessContext,
  getAvailableSlots,
  getBusinessBySlug,
} from "./get-available-slots";

const ORG = "org_itest_available_slots";
const SLUG = "itest-available-slots";
/** A UTC business, so a local date is simply the UTC date. */
const DAY = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
let business: BusinessContext;
let serviceId: string;
let bookingId: string;

beforeAll(async () => {
  await db.delete(organization).where(eq(organization.id, ORG));
  await db
    .insert(organization)
    .values({ id: ORG, name: ORG, slug: SLUG, createdAt: new Date() });
  await db.insert(businessProfiles).values({
    organizationId: ORG,
    timezone: "UTC",
    minLeadTimeMinutes: 0,
  });
  const [service] = await db
    .insert(services)
    .values({
      organizationId: ORG,
      name: "Cilt Bakımı",
      durationMinutes: 60,
      priceCents: 150_000,
    })
    .returning({ id: services.id });
  serviceId = service.id;
  // Open 09:00–12:00 on DAY only: five 60-minute starts on the 30-minute grid.
  await db.insert(availabilityRules).values({
    organizationId: ORG,
    weekday: new Date(`${DAY}T12:00:00Z`).getUTCDay(),
    startMinutes: 9 * 60,
    endMinutes: 12 * 60,
  });
  const [booked] = await db
    .insert(bookings)
    .values({
      organizationId: ORG,
      serviceId,
      customerName: "Ayşe Yılmaz",
      startsAt: new Date(`${DAY}T10:00:00Z`),
      endsAt: new Date(`${DAY}T11:00:00Z`),
      status: "confirmed",
    })
    .returning({ id: bookings.id });
  bookingId = booked.id;
  const found = await getBusinessBySlug(SLUG);
  if (!found) throw new Error("seeded business not found");
  business = found;
});

afterAll(async () => {
  await db.delete(organization).where(eq(organization.id, ORG));
  await db.$client.end();
});

const times = (slots: Date[] | null) =>
  (slots ?? []).map((slot) => slot.toISOString().slice(11, 16));

describe("getAvailableSlots", () => {
  it("leaves out every start that would overlap a booking", async () => {
    expect(times(await getAvailableSlots(business, serviceId, DAY))).toEqual([
      "09:00",
      "11:00",
    ]);
  });

  it("ignores the booking it is told to, so that booking can move onto its own time", async () => {
    const slots = await getAvailableSlots(
      business,
      serviceId,
      DAY,
      new Date(),
      {
        excludeBookingId: bookingId,
      }
    );
    expect(times(slots)).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00"]);
  });
});
