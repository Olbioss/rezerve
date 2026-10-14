/**
 * A chat customer cancels through the assistant. The 24-hour kapora rule
 * and the page's behaviour are pinned by lib/actions/customer-cancel
 * .integration.test.ts, which now runs through this core; what is tested here
 * is the assistant's credential — the customer ref, not the booking id.
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

vi.mock("@/lib/payments", () => ({
  getPaymentProvider: () => ({ refundTransaction: refundMock }),
}));
vi.mock("@/lib/email/booking-notifications", () => ({
  sendBookingConfirmedEmails: vi.fn(),
  sendBookingCancelledEmails: (...args: unknown[]) => cancelledEmail(...args),
}));

const { customerCancelCore } = await import("./customer-cancel-core");
const { db } = await import("@/lib/db");
const { organization } = await import("@/lib/db/schema/auth-schema");
const { bookings } = await import("@/lib/db/schema/booking-schema");
const { businessProfiles } = await import("@/lib/db/schema/business-schema");
const { services } = await import("@/lib/db/schema/service-schema");

const ORG = "org_itest_cancel_core";
const ALI = `telegram:${"a".repeat(26)}`;
const VELI = `telegram:${"b".repeat(26)}`;
const TX_ID = "41234567";
const HOUR = 3_600_000;
let serviceId: string;

beforeAll(async () => {
  await db.delete(organization).where(eq(organization.id, ORG));
  await db.insert(organization).values({
    id: ORG,
    name: ORG,
    slug: "itest-cancel-core",
    createdAt: new Date(),
  });
  await db
    .insert(businessProfiles)
    .values({ organizationId: ORG, timezone: "Europe/Istanbul" });
  const [service] = await db
    .insert(services)
    .values({
      organizationId: ORG,
      name: "Cilt Bakımı",
      durationMinutes: 60,
      priceCents: 150_000,
      depositCents: 30_000,
    })
    .returning({ id: services.id });
  serviceId = service.id;
});

let slot = 0;

/** Ali's paid, confirmed booking `hoursAway` from now, unless overridden. */
async function seedBooking(
  hoursAway: number,
  overrides: Partial<typeof bookings.$inferInsert> = {}
) {
  // A distinct minute each, so bookings_no_overlap never trips.
  slot += 1;
  const startsAt = new Date(Date.now() + hoursAway * HOUR + slot * 61 * 60_000);
  const [row] = await db
    .insert(bookings)
    .values({
      organizationId: ORG,
      serviceId,
      customerName: "Ali Yılmaz",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 60 * 60_000),
      status: "confirmed",
      depositCents: 30_000,
      paymentToken: `tok_${Math.random()}`,
      paymentTransactionId: TX_ID,
      source: "assistant",
      customerRef: ALI,
      ...overrides,
    })
    .returning();
  return row;
}

const reload = (id: string) =>
  db.query.bookings.findFirst({ where: eq(bookings.id, id) });

const cancel = (
  bookingId: string,
  customerRef: string | null = ALI,
  expectRefund = false
) =>
  customerCancelCore({
    organizationId: ORG,
    bookingId,
    customerRef,
    expectRefund,
    customerIp: "85.34.78.112",
  });

beforeEach(async () => {
  slot = 0;
  await db.delete(bookings).where(eq(bookings.organizationId, ORG));
  refundMock
    .mockReset()
    .mockResolvedValue({ refunded: true, errorMessage: null });
  cancelledEmail.mockReset();
});

afterAll(async () => {
  await db.delete(organization).where(eq(organization.id, ORG));
  await db.$client.end();
});

describe("customerCancelCore — through the assistant", () => {
  it("cancels a chat customer's own booking, refunding with a day's notice", async () => {
    const booking = await seedBooking(7 * 24);

    const result = await cancel(booking.id, ALI, true);

    expect(result).toMatchObject({
      ok: true,
      depositRefunded: true,
      depositKept: false,
      refundFailed: false,
    });
    const after = await reload(booking.id);
    expect(after?.status).toBe("cancelled");
    expect(after?.cancelledBy).toBe("customer");
  });

  it("refuses another chat customer's booking, even with its real id", async () => {
    const theirs = await seedBooking(7 * 24, { customerRef: VELI });

    expect(await cancel(theirs.id, ALI)).toMatchObject({
      ok: false,
      code: "not_found",
    });
    expect((await reload(theirs.id))?.status).toBe("confirmed");
    expect(refundMock).not.toHaveBeenCalled();
  });

  it("refuses a booking made on the page when a chat customer asks", async () => {
    const onThePage = await seedBooking(7 * 24, {
      source: "web",
      customerRef: null,
      customerEmail: "ayse@test.dev",
    });

    expect(await cancel(onThePage.id, ALI)).toMatchObject({
      ok: false,
      code: "not_found",
    });
    expect((await reload(onThePage.id))?.status).toBe("confirmed");
  });

  it("cancels nothing when the refund it promised is no longer due", async () => {
    const booking = await seedBooking(3);

    expect(await cancel(booking.id, ALI, true)).toMatchObject({
      ok: false,
      code: "refund_window_closed",
    });
    expect((await reload(booking.id))?.status).toBe("confirmed");
    expect(refundMock).not.toHaveBeenCalled();
  });

  it("keeps the kapora inside the last day when that is what the customer was told", async () => {
    const booking = await seedBooking(3);

    expect(await cancel(booking.id, ALI, false)).toMatchObject({
      ok: true,
      depositRefunded: false,
      depositKept: true,
    });
    expect(refundMock).not.toHaveBeenCalled();
  });
});
