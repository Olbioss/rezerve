/**
 * A chat customer moves their own booking. Unlike the owner, the customer is
 * held to the slot grid: the new time must be one the booking page would
 * offer — except that the booking's own current time never blocks it.
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

const { rescheduledMock } = vi.hoisted(() => ({ rescheduledMock: vi.fn() }));

vi.mock("@/lib/email/booking-notifications", () => ({
  sendBookingConfirmedEmails: vi.fn(),
  sendBookingCancelledEmails: vi.fn(),
  sendBookingRescheduledEmail: rescheduledMock,
}));

const { customerRescheduleCore } = await import("./customer-reschedule-core");
const { getBusinessBySlug } = await import("./get-available-slots");
const { db } = await import("@/lib/db");
const { organization } = await import("@/lib/db/schema/auth-schema");
const { availabilityRules } = await import(
  "@/lib/db/schema/availability-schema"
);
const { bookings } = await import("@/lib/db/schema/booking-schema");
const { businessProfiles } = await import("@/lib/db/schema/business-schema");
const { services } = await import("@/lib/db/schema/service-schema");

type RescheduleInput = Parameters<typeof customerRescheduleCore>[0];

const ORG = "org_itest_reschedule_core";
const SLUG = "itest-reschedule-core";
const ALI = `telegram:${"a".repeat(26)}`;
const VELI = `telegram:${"b".repeat(26)}`;
const tomorrow = new Date(Date.now() + 86_400_000);
let business: RescheduleInput["business"];
let serviceId: string;

function at(hourUTC: number, minute = 0): Date {
  const d = new Date(tomorrow);
  d.setUTCHours(hourUTC, minute, 0, 0);
  return d;
}

/** Ali's confirmed hour-long booking at `hour`, unless overridden. */
async function seedBooking(
  hour: number,
  overrides: Partial<typeof bookings.$inferInsert> = {}
) {
  const [row] = await db
    .insert(bookings)
    .values({
      organizationId: ORG,
      serviceId,
      customerName: "Ali Yılmaz",
      customerEmail: "ali@test.dev",
      startsAt: at(hour),
      endsAt: at(hour + 1),
      status: "confirmed",
      source: "assistant",
      customerRef: ALI,
      ...overrides,
    })
    .returning();
  return row;
}

const move = (bookingId: string, hour: number, minute = 0, customerRef = ALI) =>
  customerRescheduleCore({
    business,
    bookingId,
    customerRef,
    newStartsAt: at(hour, minute),
  });

const reload = (id: string) =>
  db.query.bookings.findFirst({ where: eq(bookings.id, id) });

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
  await db.insert(availabilityRules).values({
    organizationId: ORG,
    weekday: tomorrow.getUTCDay(),
    startMinutes: 9 * 60,
    endMinutes: 17 * 60,
  });
  const found = await getBusinessBySlug(SLUG);
  if (!found) throw new Error("seeded business not found");
  business = found;
});

beforeEach(async () => {
  await db.delete(bookings).where(eq(bookings.organizationId, ORG));
  rescheduledMock.mockReset();
});

afterAll(async () => {
  await db.delete(organization).where(eq(organization.id, ORG));
  await db.$client.end();
});

describe("customerRescheduleCore", () => {
  it("moves the customer's booking to a free time, keeps its length, and tells them", async () => {
    const booking = await seedBooking(9);

    const result = await move(booking.id, 13);

    expect(result.ok).toBe(true);
    const after = await reload(booking.id);
    expect(after?.startsAt.toISOString()).toBe(at(13).toISOString());
    expect(after?.endsAt.toISOString()).toBe(at(14).toISOString());
    expect(rescheduledMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: booking.id }),
      at(9)
    );
  });

  it("moves onto a time that overlaps its own", async () => {
    const booking = await seedBooking(10);

    expect((await move(booking.id, 10, 30)).ok).toBe(true);
  });

  it("refuses a time someone else holds, and changes nothing", async () => {
    await seedBooking(15, { customerRef: VELI });
    const booking = await seedBooking(9);

    expect(await move(booking.id, 15)).toMatchObject({
      ok: false,
      code: "slot_unavailable",
    });
    expect((await reload(booking.id))?.startsAt.toISOString()).toBe(
      at(9).toISOString()
    );
  });

  it("refuses a time off the slot grid", async () => {
    const booking = await seedBooking(9);

    expect(await move(booking.id, 11, 15)).toMatchObject({
      code: "slot_unavailable",
    });
  });

  it("refuses another customer's booking, even with its real id", async () => {
    const theirs = await seedBooking(9, { customerRef: VELI });

    expect(await move(theirs.id, 13)).toMatchObject({ code: "not_found" });
  });

  it("will not move a booking awaiting its kapora, or a cancelled one", async () => {
    const held = await seedBooking(9, {
      status: "pending",
      depositCents: 30_000,
      expiresAt: new Date(Date.now() + 20 * 60_000),
    });
    const cancelled = await seedBooking(11, {
      status: "cancelled",
      cancelledAt: new Date(),
    });

    expect(await move(held.id, 13)).toMatchObject({ code: "pending" });
    expect(await move(cancelled.id, 14)).toMatchObject({
      code: "already_cancelled",
    });
  });

  it("lets exactly one of two simultaneous moves into one slot through", async () => {
    const first = await seedBooking(9);
    const second = await seedBooking(11);

    const outcomes = await Promise.all([
      move(first.id, 14),
      move(second.id, 14),
    ]);
    const codes = outcomes.map((r) => (r.ok ? "ok" : r.code)).sort();

    expect(codes[0]).toBe("ok");
    expect(["slot_taken", "slot_unavailable"]).toContain(codes[1]);
    const atTwo = await db.query.bookings.findMany({
      where: and(
        eq(bookings.organizationId, ORG),
        eq(bookings.startsAt, at(14))
      ),
    });
    expect(atTwo).toHaveLength(1);
  });
});
