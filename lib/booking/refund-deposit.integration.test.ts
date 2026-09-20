/**
 * Returning a cancelled booking's kapora, against the local dev database.
 * Never touches the live iyzico API.
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

const { refundMock } = vi.hoisted(() => ({ refundMock: vi.fn() }));
vi.mock("@/lib/payments", () => ({
  getPaymentProvider: () => ({ refundTransaction: refundMock }),
}));

const { refundDeposit } = await import("./refund-deposit");
const { db } = await import("@/lib/db");
const { organization } = await import("@/lib/db/schema/auth-schema");
const { bookings } = await import("@/lib/db/schema/booking-schema");
const { services } = await import("@/lib/db/schema/service-schema");

const ORG_ID = "org_itest_refund";
const SLUG = "itest-refund";
const TX_ID = "39798591";
const IP = "85.34.78.112";
const NOW = new Date("2026-05-01T12:00:00Z");
let serviceId: string;
let bookingId: string;

beforeAll(async () => {
  await db.delete(organization).where(eq(organization.id, ORG_ID));
  await db.insert(organization).values({
    id: ORG_ID,
    name: "ITest Refund",
    slug: SLUG,
    createdAt: new Date(),
  });
  const [service] = await db
    .insert(services)
    .values({
      organizationId: ORG_ID,
      name: "Cilt Bakımı",
      durationMinutes: 60,
      priceCents: 150_000,
      depositCents: 30_000,
    })
    .returning({ id: services.id });
  serviceId = service.id;
});

async function seedBooking(overrides: Record<string, unknown> = {}) {
  await db.delete(bookings).where(eq(bookings.organizationId, ORG_ID));
  const startsAt = new Date(NOW.getTime() + 7 * 86_400_000);
  const [row] = await db
    .insert(bookings)
    .values({
      organizationId: ORG_ID,
      serviceId,
      customerName: "Ayşe Yılmaz",
      customerEmail: "ayse@test.dev",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 60 * 60_000),
      status: "cancelled",
      depositCents: 30_000,
      paymentToken: `tok_${Math.random()}`,
      paymentTransactionId: TX_ID,
      ...overrides,
    })
    .returning();
  bookingId = row.id;
  return row;
}

beforeEach(async () => {
  refundMock
    .mockReset()
    .mockResolvedValue({ refunded: true, errorMessage: null });
  await seedBooking();
});

afterAll(async () => {
  await db.delete(organization).where(eq(organization.id, ORG_ID));
  await db.$client.end();
});

const booking = () =>
  db.query.bookings.findFirst({ where: eq(bookings.id, bookingId) });

describe("refundDeposit", () => {
  it("returns the kapora the customer paid", async () => {
    expect(await refundDeposit(bookingId, IP, NOW)).toBe("refunded");
    expect(refundMock).toHaveBeenCalledWith({
      paymentTransactionId: TX_ID,
      amountCents: 30_000,
      customerIp: IP,
    });
    expect((await booking())?.depositRefundedAt).not.toBeNull();
  });

  it("refunds once, however many times it is asked", async () => {
    // Money must move exactly once; a double refund is a real loss.
    await refundDeposit(bookingId, IP, NOW);
    expect(await refundDeposit(bookingId, IP, NOW)).toBe("noop");
    expect(refundMock).toHaveBeenCalledTimes(1);
  });

  it("two concurrent cancellations refund exactly once", async () => {
    const [a, b] = await Promise.all([
      refundDeposit(bookingId, IP, NOW),
      refundDeposit(bookingId, IP, NOW),
    ]);
    expect([a, b].filter((r) => r === "refunded")).toHaveLength(1);
    expect(refundMock).toHaveBeenCalledTimes(1);
  });

  it("stays refundable when iyzico refuses", async () => {
    refundMock.mockResolvedValue({ refunded: false, errorMessage: "nope" });
    expect(await refundDeposit(bookingId, IP, NOW)).toBe("failed");
    // The claim is released, so it is not silently stuck as done.
    expect((await booking())?.depositRefundedAt).toBeNull();
  });

  it("stays refundable when the call throws", async () => {
    refundMock.mockRejectedValue(new Error("iyzico down"));
    expect(await refundDeposit(bookingId, IP, NOW)).toBe("failed");
    expect((await booking())?.depositRefundedAt).toBeNull();
  });

  it("does nothing for a booking that never paid a kapora", async () => {
    await seedBooking({ depositCents: null, paymentTransactionId: null });
    expect(await refundDeposit(bookingId, IP, NOW)).toBe("noop");
    expect(refundMock).not.toHaveBeenCalled();
  });

  it("does nothing when the payment was never captured", async () => {
    // A free booking, or one whose deposit path never ran.
    await seedBooking({ paymentTransactionId: null });
    expect(await refundDeposit(bookingId, IP, NOW)).toBe("noop");
    expect(refundMock).not.toHaveBeenCalled();
  });
});
