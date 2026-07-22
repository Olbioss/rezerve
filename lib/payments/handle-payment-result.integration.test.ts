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
