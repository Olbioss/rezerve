/**
 * The enforcement proof: online kapora is collected only for an org that is
 * both on a paid plan and has an approved submerchant to receive it.
 *
 * Runs against the local dev database (DATABASE_URL, migrations applied) and
 * never touches the live iyzico API.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => new Map([["x-forwarded-for", "85.34.78.112"]]),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectError(url);
  },
}));
vi.mock("@/lib/email/booking-notifications", () => ({
  sendBookingConfirmedEmails: vi.fn(),
  sendBookingCancelledEmails: vi.fn(),
}));
// Hoisted so the vi.mock factory below can close over it.
const { createDepositCheckout } = vi.hoisted(() => ({
  createDepositCheckout: vi.fn(async (_input: Record<string, unknown>) => ({
    token: `tok_${Math.random().toString(36).slice(2)}`,
    paymentPageUrl: "https://sandbox-cpp.iyzipay.com/checkout",
  })),
}));
vi.mock("@/lib/payments", () => ({
  getPaymentProvider: () => ({ createDepositCheckout }),
}));

class RedirectError extends Error {
  constructor(public url: string) {
    super(`REDIRECT:${url}`);
  }
}

const { createBooking } = await import("./bookings");
const { db } = await import("@/lib/db");
const { organization } = await import("@/lib/db/schema/auth-schema");
const { services } = await import("@/lib/db/schema/service-schema");
const { bookings } = await import("@/lib/db/schema/booking-schema");
const { availabilityRules } = await import(
  "@/lib/db/schema/availability-schema"
);
const { businessProfiles } = await import("@/lib/db/schema/business-schema");
const { orgPayoutAccounts, orgSubscriptions } = await import(
  "@/lib/db/schema/billing-schema"
);

const DEPOSIT_CENTS = 1000;
const SUB_MERCHANT_KEY = "sub_merchant_itest_key";
const tomorrow = new Date(Date.now() + 86_400_000);

type Fixture = { orgId: string; slug: string; serviceId: string };

const free: Fixture = {
  orgId: "org_itest_billing_free",
  slug: "itest-billing-free",
  serviceId: "",
};
const pro: Fixture = {
  orgId: "org_itest_billing_pro",
  slug: "itest-billing-pro",
  serviceId: "",
};

/** An org whose service asks for a kapora — entitlement is what differs. */
async function seedOrg(fixture: Fixture, name: string) {
  await db.delete(organization).where(eq(organization.id, fixture.orgId));
  await db.insert(organization).values({
    id: fixture.orgId,
    name,
    slug: fixture.slug,
    createdAt: new Date(),
  });
  await db.insert(businessProfiles).values({
    organizationId: fixture.orgId,
    timezone: "UTC",
    minLeadTimeMinutes: 0,
  });
  const [service] = await db
    .insert(services)
    .values({
      organizationId: fixture.orgId,
      name: "Cilt Bakımı",
      durationMinutes: 30,
      priceCents: 5000,
      depositCents: DEPOSIT_CENTS,
    })
    .returning({ id: services.id });
  fixture.serviceId = service.id;
  await db.insert(availabilityRules).values({
    organizationId: fixture.orgId,
    weekday: tomorrow.getUTCDay(),
    startMinutes: 9 * 60,
    endMinutes: 17 * 60,
  });
}

beforeAll(async () => {
  await seedOrg(free, "ITest Ücretsiz");
  await seedOrg(pro, "ITest Pro");

  await db.insert(orgSubscriptions).values({
    organizationId: pro.orgId,
    plan: "pro",
    status: "active",
    currentPeriodEndsAt: new Date(Date.now() + 30 * 86_400_000),
    lastSyncedAt: new Date(),
  });
  await db.insert(orgPayoutAccounts).values({
    organizationId: pro.orgId,
    status: "active",
    subMerchantKey: SUB_MERCHANT_KEY,
    subMerchantExternalId: pro.orgId,
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
});

afterAll(async () => {
  // Cascades to profiles, services, rules, bookings, subscription, payout.
  await db.delete(organization).where(eq(organization.id, free.orgId));
  await db.delete(organization).where(eq(organization.id, pro.orgId));
  await db.$client.end();
});

function slotAt(hourUTC: number): string {
  const d = new Date(tomorrow);
  d.setUTCHours(hourUTC, 0, 0, 0);
  return d.toISOString();
}

async function bookingFor(orgId: string) {
  const rows = await db
    .select()
    .from(bookings)
    .where(eq(bookings.organizationId, orgId));
  return rows[0];
}

describe("createBooking — kapora is gated on entitlement", () => {
  it("an unentitled org books free, and never starts a payment", async () => {
    createDepositCheckout.mockClear();

    await expect(
      createBooking({
        slug: free.slug,
        serviceId: free.serviceId,
        startsAt: slotAt(9),
        customerName: "Ayşe Yılmaz",
        customerEmail: "ayse@test.dev",
      })
      // Straight to the confirmation page: no iyzico hop.
    ).rejects.toThrow(/REDIRECT:\/r\/itest-billing-free\/onay\//);

    expect(createDepositCheckout).not.toHaveBeenCalled();

    const booking = await bookingFor(free.orgId);
    expect(booking.status).toBe("confirmed");
    // The service still stores 1000 — the booking must not claim it.
    expect(booking.depositCents).toBeNull();
    expect(booking.expiresAt).toBeNull();
  });

  it("keeps the stored kapora on the service for a later upgrade", async () => {
    const [service] = await db
      .select()
      .from(services)
      .where(eq(services.organizationId, free.orgId));
    expect(service.depositCents).toBe(DEPOSIT_CENTS);
  });

  it("an entitled org holds the slot and starts a payment", async () => {
    createDepositCheckout.mockClear();

    await expect(
      createBooking({
        slug: pro.slug,
        serviceId: pro.serviceId,
        startsAt: slotAt(9),
        customerName: "Mehmet Demir",
        customerEmail: "mehmet@test.dev",
      })
    ).rejects.toThrow(/REDIRECT:https:\/\/sandbox-cpp\.iyzipay\.com/);

    expect(createDepositCheckout).toHaveBeenCalledTimes(1);
    // The regression test for the original bug: without a submerchant key
    // the kapora settles into the platform's account, not the business's.
    expect(createDepositCheckout.mock.calls[0][0]).toMatchObject({
      subMerchantKey: SUB_MERCHANT_KEY,
      depositCents: DEPOSIT_CENTS,
    });

    const booking = await bookingFor(pro.orgId);
    expect(booking.status).toBe("pending");
    expect(booking.depositCents).toBe(DEPOSIT_CENTS);
    expect(booking.expiresAt).not.toBeNull();
    expect(booking.paymentToken).toMatch(/^tok_/);
  });
});
