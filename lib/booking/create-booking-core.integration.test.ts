/**
 * The booking rules the booking page and the chat assistant share, called the
 * way the assistant calls them: no email unless there is a kapora, a customer
 * ref instead of an address, and the kapora the customer was shown. The
 * page's own behaviour stays pinned by lib/actions/bookings*.integration.test.ts,
 * which now run through this core.
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

const { confirmedMock, createDepositCheckout } = vi.hoisted(() => ({
  confirmedMock: vi.fn(),
  createDepositCheckout: vi.fn(async (_input: Record<string, unknown>) => ({
    token: `tok_${Math.random().toString(36).slice(2)}`,
    paymentPageUrl: "https://sandbox-cpp.iyzipay.com/checkout",
  })),
}));

vi.mock("@/lib/email/booking-notifications", () => ({
  sendBookingConfirmedEmails: confirmedMock,
  sendBookingCancelledEmails: vi.fn(),
}));
vi.mock("@/lib/payments", () => ({
  getPaymentProvider: () => ({ createDepositCheckout }),
}));

const { createBookingCore } = await import("./create-booking-core");
const { getBusinessBySlug } = await import("./get-available-slots");
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

type CoreInput = Parameters<typeof createBookingCore>[0];

const ORG = "org_itest_create_core";
const SLUG = "itest-create-core";
const ALI = `telegram:${"a".repeat(26)}`;
const VELI = `telegram:${"b".repeat(26)}`;
const DEPOSIT = 30_000;
const SUB_MERCHANT_KEY = "sub_merchant_itest_create_core";
const tomorrow = new Date(Date.now() + 86_400_000);

let business: CoreInput["business"];
let haircut: string; // no kapora
let facial: string; // kapora
let retired: string; // switched off

function at(hourUTC: number, minute = 0): Date {
  const d = new Date(tomorrow);
  d.setUTCHours(hourUTC, minute, 0, 0);
  return d;
}

/** An assistant booking for Ali, unless overridden. */
function asAssistant(overrides: Partial<CoreInput> = {}): CoreInput {
  return {
    business,
    serviceId: haircut,
    startsAt: at(9),
    customerName: "Ali Yılmaz",
    customerEmail: null,
    customerPhone: "0532 111 22 33",
    source: "assistant",
    customerRef: ALI,
    throttle: { customerRef: ALI },
    customerIp: "85.34.78.112",
    ...overrides,
  };
}

/** Veli instead of Ali — another chat customer with their own throttle. */
const asVeli = (overrides: Partial<CoreInput> = {}) =>
  asAssistant({
    customerRef: VELI,
    throttle: { customerRef: VELI },
    ...overrides,
  });

const rowsFor = (customerRef: string) =>
  db.query.bookings.findMany({
    where: and(
      eq(bookings.organizationId, ORG),
      eq(bookings.customerRef, customerRef)
    ),
  });

beforeAll(async () => {
  await db.delete(organization).where(eq(organization.id, ORG));
  await db
    .insert(organization)
    .values({ id: ORG, name: "ITest Pro", slug: SLUG, createdAt: new Date() });
  await db.insert(businessProfiles).values({
    organizationId: ORG,
    timezone: "UTC",
    minLeadTimeMinutes: 0,
  });
  const rows = await db
    .insert(services)
    .values([
      {
        organizationId: ORG,
        name: "Saç Kesimi",
        durationMinutes: 30,
        priceCents: 80_000,
      },
      {
        organizationId: ORG,
        name: "Cilt Bakımı",
        durationMinutes: 30,
        priceCents: 150_000,
        depositCents: DEPOSIT,
      },
      {
        organizationId: ORG,
        name: "Eski Hizmet",
        durationMinutes: 30,
        priceCents: 10_000,
        active: false,
      },
    ])
    .returning({ id: services.id });
  [haircut, facial, retired] = rows.map((row) => row.id);
  await db.insert(availabilityRules).values({
    organizationId: ORG,
    weekday: tomorrow.getUTCDay(),
    startMinutes: 9 * 60,
    endMinutes: 17 * 60,
  });
  // Pro with an approved submerchant: kapora is collected.
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
    subMerchantKey: SUB_MERCHANT_KEY,
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
  const found = await getBusinessBySlug(SLUG);
  if (!found) throw new Error("seeded business not found");
  business = found;
});

beforeEach(async () => {
  await db.delete(bookings).where(eq(bookings.organizationId, ORG));
  await db
    .delete(bookingAttempts)
    .where(eq(bookingAttempts.organizationId, ORG));
  confirmedMock.mockClear();
  createDepositCheckout.mockClear();
});

afterAll(async () => {
  // Cascades to profile, services, rules, bookings, subscription, payout.
  await db.delete(organization).where(eq(organization.id, ORG));
  await db.$client.end();
});

describe("createBookingCore — for the chat assistant", () => {
  it("books a chat customer with no email, records whose it is, and still tells the owner", async () => {
    const result = await createBookingCore(asAssistant());

    expect(result.ok).toBe(true);
    const [row] = await rowsFor(ALI);
    expect(row).toMatchObject({
      status: "confirmed",
      source: "assistant",
      customerRef: ALI,
      customerEmail: null,
      depositCents: null,
    });
    // No customer address to write to — but the owner hears about it.
    expect(confirmedMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: row.id })
    );
  });

  it("asks for an email before a kapora, and holds nothing", async () => {
    const result = await createBookingCore(asAssistant({ serviceId: facial }));

    expect(result).toMatchObject({ ok: false, code: "email_required" });
    expect(await rowsFor(ALI)).toHaveLength(0);
    expect(createDepositCheckout).not.toHaveBeenCalled();
  });

  it("holds the slot for 30 minutes and returns the payment page", async () => {
    const result = await createBookingCore(
      asAssistant({
        serviceId: facial,
        customerEmail: "ali@test.dev",
        expectDepositCents: DEPOSIT,
      })
    );

    if (!result.ok) throw new Error(result.message);
    expect(result.checkoutUrl).toBe("https://sandbox-cpp.iyzipay.com/checkout");
    expect(result.booking.status).toBe("pending");
    const heldFor =
      ((result.holdExpiresAt?.getTime() ?? 0) - Date.now()) / 60_000;
    expect(heldFor).toBeGreaterThan(29);
    expect(heldFor).toBeLessThanOrEqual(30);
    expect(createDepositCheckout.mock.calls[0][0]).toMatchObject({
      customerEmail: "ali@test.dev",
      depositCents: DEPOSIT,
      subMerchantKey: SUB_MERCHANT_KEY,
    });
  });

  it("refuses when the kapora is not the one the customer agreed to", async () => {
    const results = [
      // Shown less than the service takes.
      await createBookingCore(
        asAssistant({
          serviceId: facial,
          customerEmail: "ali@test.dev",
          expectDepositCents: 20_000,
        })
      ),
      // Told there was none.
      await createBookingCore(
        asAssistant({
          serviceId: facial,
          customerEmail: "ali@test.dev",
          expectDepositCents: null,
          startsAt: at(10),
        })
      ),
      // Shown one on a service that takes none.
      await createBookingCore(
        asAssistant({ expectDepositCents: DEPOSIT, startsAt: at(11) })
      ),
    ];

    for (const result of results) {
      expect(result).toMatchObject({ ok: false, code: "terms_changed" });
    }
    expect(await rowsFor(ALI)).toHaveLength(0);
    expect(createDepositCheckout).not.toHaveBeenCalled();
  });

  it("books when the customer was told, rightly, that there is no kapora", async () => {
    const result = await createBookingCore(
      asAssistant({ expectDepositCents: null })
    );
    expect(result.ok).toBe(true);
  });

  it("will not book a service the business has switched off", async () => {
    expect(
      await createBookingCore(asAssistant({ serviceId: retired }))
    ).toMatchObject({ ok: false, code: "not_found" });
  });

  it("stops a chat customer after three attempts in an hour", async () => {
    // Off the slot grid: each attempt is refused, and each still counts.
    for (let i = 0; i < 3; i += 1) {
      expect(
        await createBookingCore(asAssistant({ startsAt: at(9, 7) }))
      ).toMatchObject({ code: "slot_unavailable" });
    }
    expect(await createBookingCore(asAssistant())).toMatchObject({
      code: "throttled",
    });
    // Another chat customer is not held back by Ali's attempts.
    expect((await createBookingCore(asVeli())).ok).toBe(true);
  });

  it("tells the loser of a race the slot was just taken", async () => {
    const outcomes = await Promise.all([
      createBookingCore(asAssistant({ startsAt: at(14) })),
      createBookingCore(asVeli({ startsAt: at(14) })),
    ]);
    const codes = outcomes.map((r) => (r.ok ? "ok" : r.code)).sort();

    expect(codes[0]).toBe("ok");
    expect(["slot_taken", "slot_unavailable"]).toContain(codes[1]);
  });
});
