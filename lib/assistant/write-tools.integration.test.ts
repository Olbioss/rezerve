/**
 * The assistant's write tools — thin over the booking cores, which are tested
 * on their own. What is tested here is the translation: the identity the
 * assistant acts for, a time sent with its offset, a phone that cannot be a
 * number, and refusals arriving as codes rather than exceptions.
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

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Map() }));
vi.mock("@/lib/email/booking-notifications", () => ({
  sendBookingConfirmedEmails: vi.fn(),
  sendBookingCancelledEmails: vi.fn(),
  sendBookingRescheduledEmail: vi.fn(),
}));
vi.mock("@/lib/payments", () => ({
  getPaymentProvider: () => ({
    createDepositCheckout: vi.fn(async () => ({
      token: `tok_${Math.random().toString(36).slice(2)}`,
      paymentPageUrl: "https://sandbox-cpp.iyzipay.com/checkout",
    })),
    refundTransaction: vi.fn(async () => ({
      refunded: true,
      errorMessage: null,
    })),
  }),
}));

const { cancelBookingTool, createBookingTool, rescheduleBookingTool } =
  await import("./write-tools");
const { getBusinessBySlug } = await import("@/lib/booking/get-available-slots");
const { db } = await import("@/lib/db");
const { organization } = await import("@/lib/db/schema/auth-schema");
const { availabilityRules } = await import(
  "@/lib/db/schema/availability-schema"
);
const { orgPayoutAccounts, orgSubscriptions } = await import(
  "@/lib/db/schema/billing-schema"
);
const { bookingAttempts, bookings } = await import(
  "@/lib/db/schema/booking-schema"
);
const { businessProfiles } = await import("@/lib/db/schema/business-schema");
const { services } = await import("@/lib/db/schema/service-schema");

type Identity = Parameters<typeof createBookingTool>[0];

const ORG = "org_itest_write_tools";
const SLUG = "itest-write-tools";
const ALI = `telegram:${"a".repeat(26)}`;
const VELI = `telegram:${"b".repeat(26)}`;
/** A UTC business, so a local date is simply the UTC date. */
const DAY = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
let ali: Identity;
let veli: Identity;
let haircut: string;
let facial: string;
let retired: string;

beforeAll(async () => {
  await db.delete(organization).where(eq(organization.id, ORG));
  await db
    .insert(organization)
    .values({ id: ORG, name: ORG, slug: SLUG, createdAt: new Date() });
  await db.insert(businessProfiles).values({
    organizationId: ORG,
    timezone: "UTC",
    minLeadTimeMinutes: 0,
    assistantEnabled: true,
  });
  const rows = await db
    .insert(services)
    .values([
      {
        organizationId: ORG,
        name: "Saç Kesimi",
        durationMinutes: 60,
        priceCents: 80_000,
      },
      {
        organizationId: ORG,
        name: "Cilt Bakımı",
        durationMinutes: 60,
        priceCents: 150_000,
        depositCents: 30_000,
      },
      {
        organizationId: ORG,
        name: "Eski Hizmet",
        durationMinutes: 60,
        priceCents: 10_000,
        active: false,
      },
    ])
    .returning({ id: services.id });
  [haircut, facial, retired] = rows.map((row) => row.id);
  await db.insert(availabilityRules).values({
    organizationId: ORG,
    weekday: new Date(`${DAY}T12:00:00Z`).getUTCDay(),
    startMinutes: 9 * 60,
    endMinutes: 17 * 60,
  });
  await db.insert(orgSubscriptions).values({
    organizationId: ORG,
    plan: "pro",
    status: "active",
    currentPeriodEndsAt: new Date(Date.now() + 30 * 86_400_000),
    lastSyncedAt: new Date(),
  });
  await db.insert(orgPayoutAccounts).values({
    organizationId: ORG,
    status: "active",
    subMerchantKey: "sub_merchant_itest_write_tools",
    subMerchantExternalId: ORG,
    merchantType: "personal",
    name: "ITest Pro",
    contactName: "Ada",
    contactSurname: "Lovelace",
    identityNumber: "10000000146",
    iban: "TR180006200119000006672315",
    address: "Kadıköy/İstanbul",
    gsmNumber: "+905350000000",
    email: "pro@test.dev",
  });
  const business = await getBusinessBySlug(SLUG);
  if (!business) throw new Error("seeded business not found");
  ali = { business, customerRef: ALI };
  veli = { business, customerRef: VELI };
});

beforeEach(async () => {
  await db.delete(bookings).where(eq(bookings.organizationId, ORG));
  await db
    .delete(bookingAttempts)
    .where(eq(bookingAttempts.organizationId, ORG));
});

afterAll(async () => {
  await db.delete(organization).where(eq(organization.id, ORG));
  await db.$client.end();
});

const reload = (id: string) =>
  db.query.bookings.findFirst({ where: eq(bookings.id, id) });

async function bookAt(hour: number, who = ali) {
  const result = await createBookingTool(who, {
    service_id: haircut,
    starts_at: `${DAY}T${String(hour).padStart(2, "0")}:00:00Z`,
    customer_name: "Ali Yılmaz",
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

describe("create_booking", () => {
  it("books for the customer the assistant acts for, and reads the time back", async () => {
    const result = await createBookingTool(ali, {
      service_id: haircut,
      starts_at: `${DAY}T09:00:00Z`,
      customer_name: "  Ali Yılmaz  ",
    });

    if (!result.ok) throw new Error(result.error.message);
    expect(result.data).toMatchObject({
      status: "confirmed",
      checkout_url: null,
      hold_expires_at: null,
    });
    expect(result.data.local_label.endsWith("09:00")).toBe(true);
    const row = await reload(result.data.booking_id);
    expect(row).toMatchObject({
      customerName: "Ali Yılmaz",
      customerRef: ALI,
      source: "assistant",
    });
  });

  it("reads a time sent with its offset as the same instant", async () => {
    const result = await createBookingTool(ali, {
      service_id: haircut,
      starts_at: `${DAY}T13:00:00+03:00`,
      customer_name: "Ali Yılmaz",
    });

    if (!result.ok) throw new Error(result.error.message);
    expect((await reload(result.data.booking_id))?.startsAt.toISOString()).toBe(
      `${DAY}T10:00:00.000Z`
    );
  });

  it("refuses a phone that cannot be a number, and writes nothing", async () => {
    const result = await createBookingTool(ali, {
      service_id: haircut,
      starts_at: `${DAY}T11:00:00Z`,
      customer_name: "Ali Yılmaz",
      customer_phone: "ara beni",
    });

    expect(result).toMatchObject({ ok: false, error: { code: "invalid" } });
    expect(
      await db.query.bookings.findMany({
        where: eq(bookings.organizationId, ORG),
      })
    ).toHaveLength(0);
  });

  it("passes the core's refusals through by their code", async () => {
    expect(
      await createBookingTool(ali, {
        service_id: facial,
        starts_at: `${DAY}T12:00:00Z`,
        customer_name: "Ali Yılmaz",
      })
    ).toMatchObject({ ok: false, error: { code: "email_required" } });
    expect(
      await createBookingTool(ali, {
        service_id: retired,
        starts_at: `${DAY}T12:00:00Z`,
        customer_name: "Ali Yılmaz",
      })
    ).toMatchObject({ ok: false, error: { code: "not_found" } });
  });
});

describe("reschedule_booking", () => {
  it("moves the customer's booking, and says where it was", async () => {
    const booked = await bookAt(11);

    const result = await rescheduleBookingTool(ali, {
      booking_id: booked.booking_id,
      new_starts_at: `${DAY}T12:00:00Z`,
    });

    if (!result.ok) throw new Error(result.error.message);
    expect(result.data.local_label.endsWith("12:00")).toBe(true);
    expect(result.data.previous_local_label.endsWith("11:00")).toBe(true);
  });

  it("will not move someone else's booking", async () => {
    const booked = await bookAt(11);

    expect(
      await rescheduleBookingTool(veli, {
        booking_id: booked.booking_id,
        new_starts_at: `${DAY}T12:00:00Z`,
      })
    ).toMatchObject({ ok: false, error: { code: "not_found" } });
  });
});

describe("cancel_booking", () => {
  it("cancels the customer's booking", async () => {
    const booked = await bookAt(15);

    expect(
      await cancelBookingTool(ali, { booking_id: booked.booking_id })
    ).toEqual({
      ok: true,
      data: {
        cancelled: true,
        deposit_refunded: false,
        deposit_kept: false,
        refund_failed: false,
      },
    });
    expect((await reload(booked.booking_id))?.status).toBe("cancelled");
  });

  it("will not cancel someone else's booking", async () => {
    const booked = await bookAt(15);

    expect(
      await cancelBookingTool(veli, { booking_id: booked.booking_id })
    ).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect((await reload(booked.booking_id))?.status).toBe("confirmed");
  });
});
