/**
 * A customer cancels their own booking from its page.
 *
 * The policy itself is unit-tested (lib/booking/cancellation-policy.test.ts);
 * what is tested here is the action around it: that the booking's uuid and
 * its business together are the only credential, that the kapora is refunded
 * exactly when the policy says and kept otherwise, that a deadline passing
 * while the dialog was open cancels nothing, and that the emails are told
 * which of those happened.
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

const { refundMock, cancelledEmail } = vi.hoisted(() => ({
  refundMock: vi.fn(),
  cancelledEmail: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => new Map([["x-forwarded-for", "203.0.113.9"]]),
}));
vi.mock("@/lib/payments", () => ({
  getPaymentProvider: () => ({ refundTransaction: refundMock }),
}));
vi.mock("@/lib/email/booking-notifications", () => ({
  sendBookingConfirmedEmails: vi.fn(),
  sendBookingCancelledEmails: (...args: unknown[]) => cancelledEmail(...args),
}));

const { cancelBookingAsCustomer } = await import("./bookings");
const { db } = await import("@/lib/db");
const { organization } = await import("@/lib/db/schema/auth-schema");
const { bookings } = await import("@/lib/db/schema/booking-schema");
const { businessProfiles } = await import("@/lib/db/schema/business-schema");
const { services } = await import("@/lib/db/schema/service-schema");

const ORG_ID = "org_itest_customer_cancel";
const SLUG = "itest-customer-cancel";
const OTHER_ORG = "org_itest_customer_cancel_other";
const OTHER_SLUG = "itest-customer-cancel-other";
const TX_ID = "41234567";
const HOUR = 3_600_000;
let serviceId: string;
let otherServiceId: string;

async function seedOrg(id: string, slug: string) {
  await db.delete(organization).where(eq(organization.id, id));
  await db
    .insert(organization)
    .values({ id, name: id, slug, createdAt: new Date() });
  await db
    .insert(businessProfiles)
    .values({ organizationId: id, timezone: "Europe/Istanbul" });
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
  otherServiceId = await seedOrg(OTHER_ORG, OTHER_SLUG);
});

let slot = 0;

/** A paid, confirmed booking `hoursAway` from now, unless overridden. */
async function seedBooking(
  hoursAway: number,
  overrides: Record<string, unknown> = {},
  orgId = ORG_ID,
  svcId = serviceId
) {
  // A distinct minute each, so bookings_no_overlap never trips.
  slot += 1;
  const startsAt = new Date(Date.now() + hoursAway * HOUR + slot * 61 * 60_000);
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
  return row;
}

const reload = (id: string) =>
  db.query.bookings.findFirst({ where: eq(bookings.id, id) });

const cancel = (bookingId: string, expectRefund = false, slug = SLUG) =>
  cancelBookingAsCustomer({ slug, bookingId, expectRefund });

beforeEach(async () => {
  slot = 0;
  await db.delete(bookings).where(eq(bookings.organizationId, ORG_ID));
  await db.delete(bookings).where(eq(bookings.organizationId, OTHER_ORG));
  refundMock
    .mockReset()
    .mockResolvedValue({ refunded: true, errorMessage: null });
  cancelledEmail.mockReset();
});

afterAll(async () => {
  await db.delete(organization).where(eq(organization.id, ORG_ID));
  await db.delete(organization).where(eq(organization.id, OTHER_ORG));
  await db.$client.end();
});

describe("cancelBookingAsCustomer", () => {
  it("refunds the kapora with more than a day's notice", async () => {
    const booking = await seedBooking(7 * 24);

    const result = await cancel(booking.id, true);

    expect(result).toEqual({
      cancelled: true,
      depositRefunded: true,
      depositKept: false,
      refundFailed: false,
    });
    expect(refundMock).toHaveBeenCalledTimes(1);
    expect(refundMock).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentTransactionId: TX_ID,
        amountCents: 30_000,
      })
    );
    const after = await reload(booking.id);
    expect(after?.status).toBe("cancelled");
    expect(after?.cancelledBy).toBe("customer");
    expect(after?.depositRefundedAt).not.toBeNull();
    expect(cancelledEmail).toHaveBeenCalledWith(
      expect.objectContaining({ id: booking.id }),
      true,
      { by: "customer", depositKept: false, refundFailed: false }
    );
  });

  it("frees the slot but keeps the kapora inside the last day", async () => {
    const booking = await seedBooking(3);

    const result = await cancel(booking.id, false);

    expect(result).toEqual({
      cancelled: true,
      depositRefunded: false,
      depositKept: true,
      refundFailed: false,
    });
    expect(refundMock).not.toHaveBeenCalled();
    const after = await reload(booking.id);
    expect(after?.status).toBe("cancelled");
    expect(after?.depositRefundedAt).toBeNull();
    expect(cancelledEmail).toHaveBeenCalledWith(
      expect.objectContaining({ id: booking.id }),
      false,
      { by: "customer", depositKept: true, refundFailed: false }
    );
  });

  it("cancels nothing if the refund it promised is no longer due", async () => {
    // The dialog was opened in time and confirmed after the deadline.
    const booking = await seedBooking(3);

    const result = await cancel(booking.id, true);

    expect(result).toMatchObject({ refundWindowClosed: true });
    // Turkish İ: a case-insensitive regex would not match it against "i".
    expect("error" in result && result.error).toMatch(/İade süresi doldu/);
    expect((await reload(booking.id))?.status).toBe("confirmed");
    expect(refundMock).not.toHaveBeenCalled();
    expect(cancelledEmail).not.toHaveBeenCalled();
  });

  it("has nothing to refund on a booking without a kapora", async () => {
    const booking = await seedBooking(5 * 24, {
      depositCents: null,
      paymentToken: null,
      paymentTransactionId: null,
    });

    const result = await cancel(booking.id);

    expect(result).toEqual({
      cancelled: true,
      depositRefunded: false,
      depositKept: false,
      refundFailed: false,
    });
    expect(refundMock).not.toHaveBeenCalled();
  });

  it("lets an unpaid hold go without refunding or keeping anything", async () => {
    const booking = await seedBooking(2, {
      status: "pending",
      paymentTransactionId: null,
      expiresAt: new Date(Date.now() + 20 * 60_000),
    });

    const result = await cancel(booking.id);

    expect(result).toMatchObject({
      cancelled: true,
      depositRefunded: false,
      depositKept: false,
    });
    expect((await reload(booking.id))?.status).toBe("cancelled");
    expect(refundMock).not.toHaveBeenCalled();
  });

  it("refuses an appointment that has already started", async () => {
    const booking = await seedBooking(0, {
      startsAt: new Date(Date.now() - HOUR),
      endsAt: new Date(Date.now()),
    });

    const result = await cancel(booking.id);

    expect("error" in result && result.error).toMatch(/başlamış/i);
    expect((await reload(booking.id))?.status).toBe("confirmed");
  });

  it("refuses another business's booking, even with its real id", async () => {
    const theirs = await seedBooking(7 * 24, {}, OTHER_ORG, otherServiceId);

    const result = await cancel(theirs.id, true, SLUG);

    expect("error" in result && result.error).toMatch(/bulunamadı/i);
    expect((await reload(theirs.id))?.status).toBe("confirmed");
    expect(refundMock).not.toHaveBeenCalled();
  });

  it("treats a malformed id as a booking that does not exist", async () => {
    const result = await cancel("1234-kesik");
    expect("error" in result && result.error).toMatch(/bulunamadı/i);
  });

  it("refunds once when cancelled twice", async () => {
    const booking = await seedBooking(7 * 24);

    await cancel(booking.id, true);
    const second = await cancel(booking.id, true);

    expect("error" in second && second.error).toMatch(/zaten iptal/i);
    expect(refundMock).toHaveBeenCalledTimes(1);
    expect(cancelledEmail).toHaveBeenCalledTimes(1);
  });

  it("still cancels, and says so, when the refund fails", async () => {
    refundMock.mockResolvedValue({ refunded: false, errorMessage: "5020" });
    const booking = await seedBooking(7 * 24);

    const result = await cancel(booking.id, true);

    expect(result).toEqual({
      cancelled: true,
      depositRefunded: false,
      depositKept: false,
      refundFailed: true,
    });
    const after = await reload(booking.id);
    expect(after?.status).toBe("cancelled");
    // The claim is released, so the business can still refund it by hand.
    expect(after?.depositRefundedAt).toBeNull();
    expect(cancelledEmail).toHaveBeenCalledWith(
      expect.objectContaining({ id: booking.id }),
      false,
      { by: "customer", depositKept: false, refundFailed: true }
    );
  });
});
