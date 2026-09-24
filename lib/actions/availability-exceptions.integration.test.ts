/**
 * Date exceptions, end to end: what the owner saves is what the booking
 * guard enforces. getAvailableSlots is the check createBooking validates
 * against, so a closed date having no slots there means it cannot be booked.
 */
import { and, eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const { ownerMock } = vi.hoisted(() => ({ ownerMock: vi.fn() }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth-guard", () => ({
  requireOwner: ownerMock,
  requireUser: vi.fn(),
}));

const { addDateException, deleteDateException } = await import(
  "./availability"
);
const { getAvailableSlots, getBusinessBySlug } = await import(
  "@/lib/booking/get-available-slots"
);
const { db } = await import("@/lib/db");
const { organization } = await import("@/lib/db/schema/auth-schema");
const { availabilityExceptions, availabilityRules } = await import(
  "@/lib/db/schema/availability-schema"
);
const { bookings } = await import("@/lib/db/schema/booking-schema");
const { businessProfiles } = await import("@/lib/db/schema/business-schema");
const { services } = await import("@/lib/db/schema/service-schema");

const ORG = "org_itest_exceptions";
const OTHER = "org_itest_exceptions_other";
const SLUG = "itest-exceptions";
let serviceId: string;

/** A UTC business, so a local date is simply the UTC date. */
const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const weekdayOf = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();

// Open 09:00–17:00 on OPEN_DAY's weekday only; CLOSED_DAY's weekday is shut.
const OPEN_DAY = day(3);
const CLOSED_DAY = day(4);

const slots = async (dateISO: string) => {
  const business = await getBusinessBySlug(SLUG);
  if (!business) throw new Error("business missing");
  return getAvailableSlots(business, serviceId, dateISO);
};

beforeAll(async () => {
  for (const id of [ORG, OTHER]) {
    await db.delete(organization).where(eq(organization.id, id));
  }
  await db.insert(organization).values([
    { id: ORG, name: "Salon", slug: SLUG, createdAt: new Date() },
    { id: OTHER, name: "Baska", slug: `${SLUG}-2`, createdAt: new Date() },
  ]);
  await db.insert(businessProfiles).values([
    {
      organizationId: ORG,
      timezone: "UTC",
      minLeadTimeMinutes: 0,
      // Hourly, matching the 60-minute service: 09:00–17:00 is 8 slots.
      slotGranularityMinutes: 60,
    },
    { organizationId: OTHER, timezone: "UTC" },
  ]);
  const [service] = await db
    .insert(services)
    .values({
      organizationId: ORG,
      name: "Kesim",
      durationMinutes: 60,
      priceCents: 1000,
    })
    .returning({ id: services.id });
  serviceId = service.id;
  await db.insert(availabilityRules).values({
    organizationId: ORG,
    weekday: weekdayOf(OPEN_DAY),
    startMinutes: 9 * 60,
    endMinutes: 17 * 60,
  });
});

beforeEach(async () => {
  for (const id of [ORG, OTHER]) {
    await db
      .delete(availabilityExceptions)
      .where(eq(availabilityExceptions.organizationId, id));
  }
  await db.delete(bookings).where(eq(bookings.organizationId, ORG));
  ownerMock
    .mockReset()
    .mockResolvedValue({ organizationId: ORG, profile: { timezone: "UTC" } });
});

afterAll(async () => {
  for (const id of [ORG, OTHER]) {
    await db.delete(organization).where(eq(organization.id, id));
  }
  await db.$client.end();
});

describe("addDateException", () => {
  it("closes every date of a range to booking, and nothing after it", async () => {
    expect(await slots(OPEN_DAY)).toHaveLength(8);

    const result = await addDateException({
      startsOn: day(1),
      endsOn: OPEN_DAY,
      intervals: [],
      note: "Tatil",
    });

    expect(result).toEqual({ bookingsInRange: 0 });
    expect(await slots(OPEN_DAY)).toEqual([]);
    // The same weekday a week later is untouched.
    expect(await slots(day(10))).toHaveLength(8);
  });

  it("opens a normally closed weekday for one-off hours", async () => {
    expect(await slots(CLOSED_DAY)).toEqual([]);

    await addDateException({
      startsOn: CLOSED_DAY,
      endsOn: CLOSED_DAY,
      intervals: [{ startMinutes: 10 * 60, endMinutes: 12 * 60 }],
      note: "",
    });

    expect((await slots(CLOSED_DAY))?.map((s) => s.toISOString())).toEqual([
      `${CLOSED_DAY}T10:00:00.000Z`,
      `${CLOSED_DAY}T11:00:00.000Z`,
    ]);
  });

  it("refuses a range that overlaps one already saved, saving nothing", async () => {
    await addDateException({
      startsOn: day(5),
      endsOn: day(8),
      intervals: [],
      note: "",
    });
    const result = await addDateException({
      startsOn: day(8),
      endsOn: day(9),
      intervals: [],
      note: "",
    });

    expect(result).toEqual({
      error: "Bu tarihler kayıtlı bir özel günle çakışıyor.",
    });
    const rows = await db.query.availabilityExceptions.findMany({
      where: eq(availabilityExceptions.organizationId, ORG),
    });
    expect(rows).toHaveLength(1);
  });

  it("tells the owner how many bookings fall inside, without touching them", async () => {
    await db.insert(bookings).values([
      {
        organizationId: ORG,
        serviceId,
        customerName: "Ayşe",
        customerEmail: "ayse@test.dev",
        startsAt: new Date(`${OPEN_DAY}T09:00:00Z`),
        endsAt: new Date(`${OPEN_DAY}T10:00:00Z`),
        status: "confirmed",
      },
      {
        organizationId: ORG,
        serviceId,
        customerName: "İptal",
        customerEmail: "iptal@test.dev",
        startsAt: new Date(`${OPEN_DAY}T11:00:00Z`),
        endsAt: new Date(`${OPEN_DAY}T12:00:00Z`),
        status: "cancelled",
      },
    ]);

    const result = await addDateException({
      startsOn: OPEN_DAY,
      endsOn: OPEN_DAY,
      intervals: [],
      note: "",
    });

    // Cancelled bookings are not the owner's problem any more.
    expect(result).toEqual({ bookingsInRange: 1 });
    const kept = await db.query.bookings.findMany({
      where: and(
        eq(bookings.organizationId, ORG),
        eq(bookings.status, "confirmed")
      ),
    });
    expect(kept).toHaveLength(1);
  });

  it("refuses a range that ends before it starts", async () => {
    const result = await addDateException({
      startsOn: day(6),
      endsOn: day(5),
      intervals: [],
      note: "",
    });
    expect(result).toMatchObject({ error: expect.stringMatching(/Bitiş/) });
  });

  it("refuses a start date that has already passed", async () => {
    const result = await addDateException({
      startsOn: day(-1),
      endsOn: day(1),
      intervals: [],
      note: "",
    });
    expect(result).toMatchObject({ error: expect.stringMatching(/geçmiş/i) });
  });

  it("refuses overlapping or inverted hours", async () => {
    for (const intervals of [
      [
        { startMinutes: 600, endMinutes: 720 },
        { startMinutes: 700, endMinutes: 800 },
      ],
      [{ startMinutes: 720, endMinutes: 600 }],
    ]) {
      const result = await addDateException({
        startsOn: day(2),
        endsOn: day(2),
        intervals,
        note: "",
      });
      expect(result).toHaveProperty("error");
    }
  });

  it("refuses a range longer than 90 days", async () => {
    const result = await addDateException({
      startsOn: day(1),
      endsOn: day(92),
      intervals: [],
      note: "",
    });
    expect(result).toMatchObject({ error: expect.stringMatching(/90/) });
  });
});

describe("deleteDateException", () => {
  it("removes the exception, and the hours come back", async () => {
    await addDateException({
      startsOn: OPEN_DAY,
      endsOn: OPEN_DAY,
      intervals: [],
      note: "",
    });
    const [row] = await db.query.availabilityExceptions.findMany({
      where: eq(availabilityExceptions.organizationId, ORG),
    });

    await deleteDateException(row.id);

    expect(await slots(OPEN_DAY)).toHaveLength(8);
  });

  it("cannot delete another business's exception", async () => {
    const [theirs] = await db
      .insert(availabilityExceptions)
      .values({ organizationId: OTHER, startsOn: day(3), endsOn: day(3) })
      .returning({ id: availabilityExceptions.id });

    await deleteDateException(theirs.id);

    const still = await db.query.availabilityExceptions.findFirst({
      where: eq(availabilityExceptions.id, theirs.id),
    });
    expect(still).toBeDefined();
  });
});
