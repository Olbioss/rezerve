/**
 * Subscription callback idempotency, against the local dev database.
 * Mirrors lib/payments/handle-payment-result.integration.test.ts.
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

const { providerMock } = vi.hoisted(() => ({
  providerMock: {
    retrieveSubscriptionCheckout: vi.fn(),
    retrieveSubscription: vi.fn(),
  },
}));
vi.mock("@/lib/payments", () => ({
  getPaymentProvider: () => providerMock,
}));

const { handleSubscriptionResult } = await import(
  "./handle-subscription-result"
);
const { db } = await import("@/lib/db");
const { organization } = await import("@/lib/db/schema/auth-schema");
const { billingEvents, orgSubscriptions } = await import(
  "@/lib/db/schema/billing-schema"
);

const ORG_ID = "org_itest_subs";
const SLUG = "itest-subs";
const TOKEN = "checkout_token_itest";
const SUB_REF = "sub_ref_itest";

const PERIOD_END = new Date(Date.now() + 30 * 86_400_000);

beforeAll(async () => {
  await db.delete(organization).where(eq(organization.id, ORG_ID));
  await db.insert(organization).values({
    id: ORG_ID,
    name: "ITest Subs",
    slug: SLUG,
    createdAt: new Date(),
  });
});

beforeEach(async () => {
  await db
    .delete(orgSubscriptions)
    .where(eq(orgSubscriptions.organizationId, ORG_ID));
  await db.insert(orgSubscriptions).values({
    organizationId: ORG_ID,
    plan: "free",
    status: "pending",
    checkoutToken: TOKEN,
  });
  providerMock.retrieveSubscription.mockResolvedValue({
    status: "ACTIVE",
    trialEndsAt: null,
    currentPeriodEndsAt: PERIOD_END,
  });
});

afterAll(async () => {
  await db.delete(organization).where(eq(organization.id, ORG_ID));
  await db.$client.end();
});

function paid(value: boolean) {
  providerMock.retrieveSubscriptionCheckout.mockResolvedValue({
    organizationId: ORG_ID,
    paid: value,
    subscriptionRef: value ? SUB_REF : null,
    customerRef: value ? "cus_itest" : null,
  });
}

async function row() {
  return db.query.orgSubscriptions.findFirst({
    where: eq(orgSubscriptions.organizationId, ORG_ID),
  });
}

describe("handleSubscriptionResult (integration)", () => {
  it("activates a pending subscription on a successful result", async () => {
    paid(true);
    const { outcome } = await handleSubscriptionResult(TOKEN);
    expect(outcome).toBe("activated");

    const subscription = await row();
    expect(subscription?.status).toBe("active");
    expect(subscription?.plan).toBe("pro");
    expect(subscription?.iyzicoSubscriptionRef).toBe(SUB_REF);
    // Consumed, so a replay can't match it again.
    expect(subscription?.checkoutToken).toBeNull();
  });

  it("is a no-op on a duplicate callback", async () => {
    paid(true);
    await handleSubscriptionResult(TOKEN);
    const { outcome } = await handleSubscriptionResult(TOKEN);
    expect(outcome).toBe("noop");
    expect((await row())?.status).toBe("active");
  });

  it("ignores a token that belongs to no subscription", async () => {
    paid(true);
    const { outcome } = await handleSubscriptionResult("stolen_token");
    expect(outcome).toBe("noop");
    // The real pending row is untouched.
    expect((await row())?.status).toBe("pending");
  });

  it("grants no plan when the payment failed", async () => {
    paid(false);
    const { outcome } = await handleSubscriptionResult(TOKEN);
    expect(outcome).toBe("failed");

    const subscription = await row();
    expect(subscription?.status).toBe("none");
    expect(subscription?.plan).toBe("free");
  });

  it("does not resurrect a subscription when success arrives after failure", async () => {
    paid(false);
    await handleSubscriptionResult(TOKEN);
    paid(true);
    const { outcome } = await handleSubscriptionResult(TOKEN);
    expect(outcome).toBe("noop");
    expect((await row())?.status).toBe("none");
  });

  it("records exactly one audit row per real transition", async () => {
    await db
      .delete(billingEvents)
      .where(eq(billingEvents.organizationId, ORG_ID));
    paid(true);
    await handleSubscriptionResult(TOKEN);
    await handleSubscriptionResult(TOKEN);

    const events = await db
      .select()
      .from(billingEvents)
      .where(eq(billingEvents.organizationId, ORG_ID));
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("subscription.active");
  });
});
