/**
 * The owner's two verbs besides cancel: book someone in, and move a booking.
 *
 * Owners are not held to the customer's slot grid, and may go outside their
 * published hours — but only after being asked, which is the
 * `outsideHours` answer these tests keep checking. The exclusion constraint
 * is never negotiable: no confirmation books over another appointment.
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

const { ownerMock, confirmedMock, rescheduledMock } = vi.hoisted(() => ({
  ownerMock: vi.fn(),
  confirmedMock: vi.fn(),
  rescheduledMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth-guard", () => ({
  requireOwner: ownerMock,
  requireUser: vi.fn(),
}));
vi.mock("@/lib/email/booking-notifications", () => ({
  sendBookingConfirmedEmails: confirmedMock,
  sendBookingRescheduledEmail: rescheduledMock,
  sendBookingCancelledEmails: vi.fn(),
}));

const { ownerCreateBooking, rescheduleBooking } = await import(
  "./owner-bookings"
);
const { db } = await import("@/lib/db");
const { organization } = await import("@/lib/db/schema/auth-schema");
const { availabilityExceptions, availabilityRules } = await import(
  "@/lib/db/schema/availability-schema"
);
const { bookings } = await import("@/lib/db/schema/booking-schema");
const { businessProfiles } = await import("@/lib/db/schema/business-schema");
const { services } = await import("@/lib/db/schema/service-schema");

const ORG = "org_itest_owner_bookings";
const OTHER = "org_itest_owner_bookings_other";
let serviceId: string;
let otherServiceId: string;

/** A UTC business, so a local date is simply the UTC date. */
const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const weekdayOf = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();

// Open 09:00–17:00 on OPEN_DAY's weekday only.
const OPEN_DAY = day(3);

const book = (overrides: Record<string, unknown> = {}) =>
  ownerCreateBooking({
    serviceId,
    dateISO: OPEN_DAY,
    time: "10:00",
    customerName: "Ayşe Yılmaz",
    customerEmail: "ayse@test.dev",
    customerPhone: "0532 111 22 33",
    ...overrides,
  });

const rowsFor = (email: string) =>
  db.query.bookings.findMany({
    where: and(
      eq(bookings.organizationId, ORG),
      eq(bookings.customerEmail, email)
    ),
  });

beforeAll(async () => {
  for (const id of [ORG, OTHER]) {
    await db.delete(organization).where(eq(organization.id, id));
  }
  await db.insert(organization).values([
    { id: ORG, name: "Salon", slug: "itest-owner-bk", createdAt: new Date() },
    {
      id: OTHER,
      name: "Baska",
      slug: "itest-owner-bk-2",
      createdAt: new Date(),
    },
  ]);
  await db.insert(businessProfiles).values([
    { organizationId: ORG, timezone: "UTC" },
    { organizationId: OTHER, timezone: "UTC" },
  ]);
  const [service, other] = await db
    .insert(services)
    .values([
      {
        organizationId: ORG,
        name: "Kesim",
        durationMinutes: 60,
        priceCents: 1000,
      },
      {
        organizationId: OTHER,
        name: "Baska kesim",
        durationMinutes: 60,
        priceCents: 1000,
      },
    ])
    .returning({ id: services.id });
  serviceId = service.id;
  otherServiceId = other.id;
  await db.insert(availabilityRules).values({
    organizationId: ORG,
    weekday: weekdayOf(OPEN_DAY),
    startMinutes: 9 * 60,
    endMinutes: 17 * 60,
  });
});

beforeEach(async () => {
  await db.delete(bookings).where(eq(bookings.organizationId, ORG));
  await db.delete(bookings).where(eq(bookings.organizationId, OTHER));
  await db
    .delete(availabilityExceptions)
    .where(eq(availabilityExceptions.organizationId, ORG));
  ownerMock
    .mockReset()
    .mockResolvedValue({ organizationId: ORG, profile: { timezone: "UTC" } });
  confirmedMock.mockReset();
  rescheduledMock.mockReset();
});

afterAll(async () => {
  for (const id of [ORG, OTHER]) {
    await db.delete(organization).where(eq(organization.id, id));
  }
  await db.$client.end();
});

describe("ownerCreateBooking", () => {
  it("books a confirmed appointment with no kapora, and tells the customer only", async () => {
    expect(await book()).toEqual({ ok: true });

    const [row] = await rowsFor("ayse@test.dev");
    expect(row.status).toBe("confirmed");
    expect(row.depositCents).toBeNull();
    expect(row.startsAt.toISOString()).toBe(`${OPEN_DAY}T10:00:00.000Z`);
    expect(row.endsAt.toISOString()).toBe(`${OPEN_DAY}T11:00:00.000Z`);
    expect(row.customerPhone).toBe("0532 111 22 33");
    // The owner made it; the owner needs no email about it.
    expect(confirmedMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: row.id }),
      { notifyOwner: false }
    );
  });

  it("takes a time off the customers' slot grid", async () => {
    expect(await book({ time: "10:15" })).toEqual({ ok: true });
  });

  it("asks before booking outside the published hours, and saves nothing", async () => {
    expect(await book({ time: "16:30" })).toEqual({ outsideHours: true });
    expect(await rowsFor("ayse@test.dev")).toHaveLength(0);
  });

  it("books outside the hours once the owner confirms", async () => {
    expect(await book({ time: "17:30", outsideHoursConfirmed: true })).toEqual({
      ok: true,
    });
    expect(await rowsFor("ayse@test.dev")).toHaveLength(1);
  });

  it("counts a holiday as outside the hours", async () => {
    await db.insert(availabilityExceptions).values({
      organizationId: ORG,
      startsOn: OPEN_DAY,
      endsOn: OPEN_DAY,
    });
    expect(await book()).toEqual({ outsideHours: true });
  });

  it("never books over another appointment, confirmed or not", async () => {
    await book();
    const clash = await book({
      time: "10:30",
      customerEmail: "mehmet@test.dev",
      outsideHoursConfirmed: true,
    });
    expect(clash).toEqual({ error: "Bu saatte başka bir randevu var." });
    expect(await rowsFor("mehmet@test.dev")).toHaveLength(0);
  });

  it("books someone with no email address", async () => {
    // A phone booking: a name and a number.
    expect(
      await book({ customerName: "Kemal Bey", customerEmail: "" })
    ).toEqual({ ok: true });
    const row = await db.query.bookings.findFirst({
      where: eq(bookings.customerName, "Kemal Bey"),
    });
    expect(row?.customerEmail).toBeNull();
  });

  it("refuses a time that has already passed", async () => {
    const result = await book({ dateISO: day(-1) });
    expect(result).toMatchObject({ error: expect.stringMatching(/geçmiş/i) });
  });

  it("refuses another business's service", async () => {
    expect(await book({ serviceId: otherServiceId })).toEqual({
      error: "Hizmet bulunamadı",
    });
  });

  it("refuses a malformed email rather than storing it", async () => {
    expect(await book({ customerEmail: "ayse@" })).toHaveProperty("error");
  });
});

describe("rescheduleBooking", () => {
  async function existing(status: "confirmed" | "pending" | "cancelled") {
    const [row] = await db
      .insert(bookings)
      .values({
        organizationId: ORG,
        serviceId,
        customerName: "Ayşe",
        customerEmail: "ayse@test.dev",
        startsAt: new Date(`${OPEN_DAY}T10:00:00Z`),
        // 90 minutes, not the service's 60: a move keeps the booking's own length.
        endsAt: new Date(`${OPEN_DAY}T11:30:00Z`),
        status,
        expiresAt:
          status === "pending" ? new Date(Date.now() + 30 * 60_000) : null,
      })
      .returning();
    return row;
  }

  it("moves the appointment, keeps its length, and tells the customer", async () => {
    const before = await existing("confirmed");

    expect(
      await rescheduleBooking({
        bookingId: before.id,
        dateISO: OPEN_DAY,
        time: "14:00",
      })
    ).toEqual({ ok: true });

    const after = await db.query.bookings.findFirst({
      where: eq(bookings.id, before.id),
    });
    expect(after?.startsAt.toISOString()).toBe(`${OPEN_DAY}T14:00:00.000Z`);
    expect(after?.endsAt.toISOString()).toBe(`${OPEN_DAY}T15:30:00.000Z`);
    expect(rescheduledMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: before.id }),
      before.startsAt
    );
  });

  it("asks before moving it outside the hours, then does", async () => {
    const before = await existing("confirmed");
    const move = { bookingId: before.id, dateISO: OPEN_DAY, time: "16:00" };

    expect(await rescheduleBooking(move)).toEqual({ outsideHours: true });
    expect(
      await rescheduleBooking({ ...move, outsideHoursConfirmed: true })
    ).toEqual({ ok: true });
  });

  it("will not move it onto another appointment", async () => {
    const moving = await existing("confirmed");
    await book({ time: "14:00", customerEmail: "mehmet@test.dev" });

    const result = await rescheduleBooking({
      bookingId: moving.id,
      dateISO: OPEN_DAY,
      time: "13:30",
    });

    expect(result).toEqual({ error: "Bu saatte başka bir randevu var." });
    const unchanged = await db.query.bookings.findFirst({
      where: eq(bookings.id, moving.id),
    });
    expect(unchanged?.startsAt.toISOString()).toBe(`${OPEN_DAY}T10:00:00.000Z`);
    expect(rescheduledMock).not.toHaveBeenCalled();
  });

  it("will not move a cancelled booking, or one still awaiting its kapora", async () => {
    for (const status of ["cancelled", "pending"] as const) {
      await db.delete(bookings).where(eq(bookings.organizationId, ORG));
      const row = await existing(status);
      const result = await rescheduleBooking({
        bookingId: row.id,
        dateISO: OPEN_DAY,
        time: "14:00",
      });
      expect(result).toHaveProperty("error");
    }
  });

  it("cannot touch another business's booking", async () => {
    const [theirs] = await db
      .insert(bookings)
      .values({
        organizationId: OTHER,
        serviceId: otherServiceId,
        customerName: "Başkası",
        customerEmail: "baska@test.dev",
        startsAt: new Date(`${OPEN_DAY}T10:00:00Z`),
        endsAt: new Date(`${OPEN_DAY}T11:00:00Z`),
        status: "confirmed",
      })
      .returning();

    const result = await rescheduleBooking({
      bookingId: theirs.id,
      dateISO: OPEN_DAY,
      time: "14:00",
      outsideHoursConfirmed: true,
    });

    expect(result).toEqual({ error: "Randevu bulunamadı" });
    const still = await db.query.bookings.findFirst({
      where: eq(bookings.id, theirs.id),
    });
    expect(still?.startsAt.toISOString()).toBe(`${OPEN_DAY}T10:00:00.000Z`);
  });
});
