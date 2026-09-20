/**
 * cancelBooking end to end: the owner cancels, the customer gets their kapora
 * back, and the email says so.
 *
 * refundDeposit is covered on its own elsewhere; what is tested here is the
 * wiring — that cancelling actually calls it, with the right booking, and that
 * the email reflects the outcome. That join is exactly what nothing checked.
 */
import { eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const { refundMock, cancelledEmail, ownerMock } = vi.hoisted(() => ({
  refundMock: vi.fn(),
  cancelledEmail: vi.fn(),
  ownerMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => new Map([["x-forwarded-for", "203.0.113.9"]]),
}));
vi.mock("@/lib/auth-guard", () => ({ requireOwner: ownerMock }));
vi.mock("@/lib/payments", () => ({
  getPaymentProvider: () => ({ refundTransaction: refundMock }),
}));
vi.mock("@/lib/email/booking-notifications", () => ({
  sendBookingConfirmedEmails: vi.fn(),
  sendBookingCancelledEmails: (...args: unknown[]) => cancelledEmail(...args),
}));

const { cancelBooking } = await import("./bookings");
const { db } = await import("@/lib/db");
const { organization } = await import("@/lib/db/schema/auth-schema");
const { bookings } = await import("@/lib/db/schema/booking-schema");
const { services } = await import("@/lib/db/schema/service-schema");

const ORG_ID = "org_itest_cancel";
const SLUG = "itest-cancel";
const OTHER_ORG = "org_itest_cancel_other";
const TX_ID = "39798591";
let serviceId: string;
let otherServiceId: string;
let bookingId: string;

async function seedOrg(id: string, slug: string) {
  await db.delete(organization).where(eq(organization.id, id));
  await db.insert(organization).values({
    id,
    name: id,
    slug,
    createdAt: new Date(),
  });
  const [service] = await db
    .insert(services)
    .values({
      organizationId: id,
      name: "Cilt Bakımı",
      durationMinutes: 60,
      priceCents: 150_000,
      depositCents: 30_000,
    })
    .returning({ id: services.id });
  return service.id;
}

beforeAll(async () => {
  serviceId = await seedOrg(ORG_ID, SLUG);
  otherServiceId = await seedOrg(OTHER_ORG, `${SLUG}-other`);
});

let slot = 0;

async function seedBooking(
  orgId = ORG_ID,
  svcId = serviceId,
  overrides: Record<string, unknown> = {}
) {
  // Distinct slots: bookings_no_overlap forbids two live bookings from
  // overlapping within one organization.
  slot += 1;
  const startsAt = new Date(Date.now() + (7 * 24 + slot) * 3_600_000);
  const [row] = await db
    .insert(bookings)
    .values({
      organizationId: orgId,
      serviceId: svcId,
      customerName: "Ayşe Yılmaz",
      customerEmail: "ayse@test.dev",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 60 * 60_000),
      status: "confirmed",
      depositCents: 30_000,
      paymentToken: `tok_${Math.random()}`,
      paymentTransactionId: TX_ID,
      ...overrides,
    })
    .returning();
  return row.id;
}

beforeEach(async () => {
  await db.delete(bookings).where(eq(bookings.organizationId, ORG_ID));
  await db.delete(bookings).where(eq(bookings.organizationId, OTHER_ORG));
  refundMock
    .mockReset()
    .mockResolvedValue({ refunded: true, errorMessage: null });
  cancelledEmail.mockReset();
  ownerMock.mockReset().mockResolvedValue({ organizationId: ORG_ID });
  bookingId = await seedBooking();
});

afterAll(async () => {
  await db.delete(organization).where(eq(organization.id, ORG_ID));
  await db.delete(organization).where(eq(organization.id, OTHER_ORG));
  await db.$client.end();
});

const booking = (id = bookingId) =>
  db.query.bookings.findFirst({ where: eq(bookings.id, id) });

describe("cancelBooking — the business calls it off", () => {
  it("refunds the customer and tells them so", async () => {
    await cancelBooking(bookingId);

    expect(refundMock).toHaveBeenCalledWith({
      paymentTransactionId: TX_ID,
      amountCents: 30_000,
      customerIp: "203.0.113.9",
    });
    const row = await booking();
    expect(row?.status).toBe("cancelled");
    expect(row?.depositRefundedAt).not.toBeNull();
    // The email is the customer's only notice that the money came back.
    expect(cancelledEmail).toHaveBeenCalledTimes(1);
    expect(cancelledEmail.mock.calls[0][1]).toBe(true);
  });

  it("does not claim a refund that did not happen", async () => {
    refundMock.mockResolvedValue({ refunded: false, errorMessage: "nope" });
    await cancelBooking(bookingId);

    expect(cancelledEmail.mock.calls[0][1]).toBe(false);
    expect((await booking())?.depositRefundedAt).toBeNull();
  });

  it("still emails when the refund throws outright", async () => {
    // The appointment is already cancelled; losing the email would leave the
    // customer with no idea it happened.
    refundMock.mockRejectedValue(new Error("iyzico down"));
    await cancelBooking(bookingId);

    const row = await booking();
    expect(row?.status).toBe("cancelled");
    expect(cancelledEmail).toHaveBeenCalledTimes(1);
    expect(cancelledEmail.mock.calls[0][1]).toBe(false);
  });

  it("refunds once when cancelled twice", async () => {
    await cancelBooking(bookingId);
    await cancelBooking(bookingId);
    // The second cancel matches zero rows, so nothing runs again.
    expect(refundMock).toHaveBeenCalledTimes(1);
    expect(cancelledEmail).toHaveBeenCalledTimes(1);
  });

  it("has nothing to refund on a booking with no kapora", async () => {
    const freeId = await seedBooking(ORG_ID, serviceId, {
      depositCents: null,
      paymentToken: null,
      paymentTransactionId: null,
    });
    await cancelBooking(freeId);

    expect(refundMock).not.toHaveBeenCalled();
    expect(cancelledEmail.mock.calls[0][1]).toBe(false);
    expect((await booking(freeId))?.status).toBe("cancelled");
  });

  it("cannot cancel or refund another business's booking", async () => {
    const theirs = await seedBooking(OTHER_ORG, otherServiceId);
    await cancelBooking(theirs);

    // Scoped by organizationId, so the update matches nothing.
    expect((await booking(theirs))?.status).toBe("confirmed");
    expect(refundMock).not.toHaveBeenCalled();
    expect(cancelledEmail).not.toHaveBeenCalled();
  });
});
