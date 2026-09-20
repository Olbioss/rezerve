/**
 * Integration tests for the iyzico payment-result handler against the dev DB.
 * Email sends are mocked; state transitions and idempotency are real.
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

const sendConfirmed = vi.fn();
const sendCancelled = vi.fn();
vi.mock("@/lib/email/booking-notifications", () => ({
  sendBookingConfirmedEmails: (...args: unknown[]) => sendConfirmed(...args),
  sendBookingCancelledEmails: (...args: unknown[]) => sendCancelled(...args),
}));

const { approveMock, refundMock } = vi.hoisted(() => ({
  approveMock: vi.fn(),
  refundMock: vi.fn(),
}));
vi.mock("@/lib/payments", () => ({
  getPaymentProvider: () => ({
    approveTransaction: approveMock,
    refundTransaction: refundMock,
  }),
}));

const { confirmPaidBooking, cancelFailedPayment } = await import(
  "./handle-payment-result"
);
const { db } = await import("@/lib/db");
const { organization } = await import("@/lib/db/schema/auth-schema");
const { bookings } = await import("@/lib/db/schema/booking-schema");
const { businessProfiles } = await import("@/lib/db/schema/business-schema");
const { services } = await import("@/lib/db/schema/service-schema");

const ORG_ID = "org_itest_payment";
const TOKEN = "itest-iyzico-token";
let serviceId: string;
let bookingId: string;

async function bookingStatus(): Promise<string | undefined> {
  const row = await db.query.bookings.findFirst({
    where: eq(bookings.id, bookingId),
  });
  return row?.status;
}

beforeAll(async () => {
  await db.delete(organization).where(eq(organization.id, ORG_ID));
  await db.insert(organization).values({
    id: ORG_ID,
    name: "Payment Salon",
    slug: "itest-payment",
    createdAt: new Date(),
  });
  await db
    .insert(businessProfiles)
    .values({ organizationId: ORG_ID, timezone: "UTC" });
  const [service] = await db
    .insert(services)
    .values({
      organizationId: ORG_ID,
      name: "Kaporali Bakim",
      durationMinutes: 30,
      priceCents: 5000,
      depositCents: 1000,
    })
    .returning({ id: services.id });
  serviceId = service.id;
});

beforeEach(async () => {
  sendConfirmed.mockClear();
  sendCancelled.mockClear();
  await db.delete(bookings).where(eq(bookings.organizationId, ORG_ID));
  const startsAt = new Date(Date.now() + 7 * 86_400_000);
  const [booking] = await db
    .insert(bookings)
    .values({
      organizationId: ORG_ID,
      serviceId,
      customerName: "Pending Pat",
      customerEmail: "pat@test.dev",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 30 * 60_000),
      status: "pending",
      depositCents: 1000,
      paymentToken: TOKEN,
      expiresAt: new Date(Date.now() + 30 * 60_000),
    })
    .returning({ id: bookings.id });
  bookingId = booking.id;
});

afterAll(async () => {
  await db.delete(organization).where(eq(organization.id, ORG_ID));
  await db.$client.end();
});

describe("handle-payment-result (integration)", () => {
  it("successful payment confirms the pending booking and emails once", async () => {
    expect(await confirmPaidBooking(bookingId, TOKEN)).toBe("confirmed");
    expect(await bookingStatus()).toBe("confirmed");
    expect(sendConfirmed).toHaveBeenCalledTimes(1);
  });

  it("duplicate callback: no second email, state unchanged", async () => {
    await confirmPaidBooking(bookingId, TOKEN);
    expect(await confirmPaidBooking(bookingId, TOKEN)).toBe("noop");
    expect(await bookingStatus()).toBe("confirmed");
    expect(sendConfirmed).toHaveBeenCalledTimes(1);
  });

  it("wrong token cannot confirm the booking", async () => {
    expect(await confirmPaidBooking(bookingId, "stolen-token")).toBe("noop");
    expect(await bookingStatus()).toBe("pending");
    expect(sendConfirmed).not.toHaveBeenCalled();
  });

  it("failed payment cancels the hold silently", async () => {
    expect(await cancelFailedPayment(bookingId, TOKEN)).toBe("cancelled");
    expect(await bookingStatus()).toBe("cancelled");
    expect(sendCancelled).not.toHaveBeenCalled();
  });

  it("success after cancellation does not resurrect the booking", async () => {
    await cancelFailedPayment(bookingId, TOKEN);
    expect(await confirmPaidBooking(bookingId, TOKEN)).toBe("noop");
    expect(await bookingStatus()).toBe("cancelled");
    expect(sendConfirmed).not.toHaveBeenCalled();
  });
});

describe("confirmPaidBooking — releasing the kapora", () => {
  const TX = "39798795";

  it("approves the transaction so the money leaves escrow", async () => {
    // Without this the kapora reaches the business's submerchant and stays
    // held by iyzico forever — the bug this path exists to close.
    approveMock.mockReset().mockResolvedValue(undefined);

    expect(await confirmPaidBooking(bookingId, TOKEN, TX)).toBe("confirmed");
    expect(approveMock).toHaveBeenCalledWith(TX);

    const [row] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, bookingId));
    expect(row.status).toBe("confirmed");
    expect(row.paymentTransactionId).toBe(TX);
  });

  it("releases once, however many times the callback fires", async () => {
    approveMock.mockReset().mockResolvedValue(undefined);

    await confirmPaidBooking(bookingId, TOKEN, TX);
    expect(await confirmPaidBooking(bookingId, TOKEN, TX)).toBe("noop");
    // The guarded update stops the replay before it can approve again.
    expect(approveMock).toHaveBeenCalledTimes(1);
  });

  it("still confirms the booking when approval fails", async () => {
    // The customer has paid; refusing to confirm would be worse than a payout
    // that needs releasing by hand.
    approveMock.mockReset().mockRejectedValue(new Error("iyzico down"));

    expect(await confirmPaidBooking(bookingId, TOKEN, TX)).toBe("confirmed");
    const [row] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, bookingId));
    expect(row.status).toBe("confirmed");
    // Stored, so the stuck payout can be found and released.
    expect(row.paymentTransactionId).toBe(TX);
  });

  it("skips approval when iyzico returned no transaction id", async () => {
    approveMock.mockReset().mockResolvedValue(undefined);

    expect(await confirmPaidBooking(bookingId, TOKEN, null)).toBe("confirmed");
    expect(approveMock).not.toHaveBeenCalled();
  });
});

describe("confirmPaidBooking — payment for a booking that is already gone", () => {
  const TX = "39806530";

  beforeEach(() => {
    approveMock.mockReset().mockResolvedValue(undefined);
    refundMock
      .mockReset()
      .mockResolvedValue({ refunded: true, errorMessage: null });
  });

  async function cancelIt() {
    await db
      .update(bookings)
      .set({ status: "cancelled" })
      .where(eq(bookings.id, bookingId));
  }

  it("refunds when the owner cancelled while the customer was paying", async () => {
    await cancelIt();

    expect(await confirmPaidBooking(bookingId, TOKEN, TX)).toBe("refunded");
    expect(refundMock).toHaveBeenCalledWith({
      paymentTransactionId: TX,
      amountCents: 1000,
      customerIp: "85.34.78.112",
    });
    // Never approved: that would release money for a booking that is gone.
    expect(approveMock).not.toHaveBeenCalled();
  });

  it("refunds when the expiry sweep took the hold", async () => {
    // cancelExpiredHolds runs on any other booking attempt for the org, so
    // this is the likelier of the two races.
    await cancelIt();
    expect(await confirmPaidBooking(bookingId, TOKEN, TX)).toBe("refunded");

    const [row] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, bookingId));
    // Stored even though the booking is gone: without it the payment has no
    // handle and a failed refund would be unrecoverable.
    expect(row.paymentTransactionId).toBe(TX);
    expect(row.depositRefundedAt).not.toBeNull();
    expect(row.status).toBe("cancelled");
  });

  it("refunds once when the callback is replayed", async () => {
    await cancelIt();
    await confirmPaidBooking(bookingId, TOKEN, TX);
    expect(await confirmPaidBooking(bookingId, TOKEN, TX)).toBe("noop");
    expect(refundMock).toHaveBeenCalledTimes(1);
  });

  it("ignores a token that does not belong to the booking", async () => {
    await cancelIt();
    expect(await confirmPaidBooking(bookingId, "someone-elses-token", TX)).toBe(
      "noop"
    );
    expect(refundMock).not.toHaveBeenCalled();
  });

  it("leaves it recoverable when the refund fails", async () => {
    await cancelIt();
    refundMock.mockResolvedValue({ refunded: false, errorMessage: "nope" });

    expect(await confirmPaidBooking(bookingId, TOKEN, TX)).toBe("noop");
    const [row] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, bookingId));
    // The id is kept so the stuck payment can be found and refunded by hand.
    expect(row.paymentTransactionId).toBe(TX);
    expect(row.depositRefundedAt).toBeNull();
  });
});
