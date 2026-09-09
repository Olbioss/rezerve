/**
 * Provider status → our vocabulary, and the audit trail's "only on change"
 * rule. Runs against the local dev database.
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
import type { ProviderSubscriptionStatus } from "@/lib/payments/provider";

const { providerMock } = vi.hoisted(() => ({
  providerMock: { retrieveSubscription: vi.fn() },
}));
vi.mock("@/lib/payments", () => ({ getPaymentProvider: () => providerMock }));

const { applySubscriptionState, reconcileIfStale } = await import(
  "./sync-subscription"
);
const { db } = await import("@/lib/db");
const { organization } = await import("@/lib/db/schema/auth-schema");
const { billingEvents, orgSubscriptions } = await import(
  "@/lib/db/schema/billing-schema"
);

const ORG_ID = "org_itest_sync";
const SLUG = "itest-sync";
const SUB_REF = "sub_ref_sync";
const PERIOD_END = new Date(Date.now() + 30 * 86_400_000);

beforeAll(async () => {
  await db.delete(organization).where(eq(organization.id, ORG_ID));
  await db.insert(organization).values({
    id: ORG_ID,
    name: "ITest Sync",
    slug: SLUG,
    createdAt: new Date(),
  });
});

beforeEach(async () => {
  providerMock.retrieveSubscription.mockReset();
  await db
    .delete(billingEvents)
    .where(eq(billingEvents.organizationId, ORG_ID));
  await db
    .delete(orgSubscriptions)
    .where(eq(orgSubscriptions.organizationId, ORG_ID));
  await db.insert(orgSubscriptions).values({
    organizationId: ORG_ID,
    plan: "free",
    status: "pending",
    iyzicoSubscriptionRef: SUB_REF,
  });
});

afterAll(async () => {
  await db.delete(organization).where(eq(organization.id, ORG_ID));
  await db.$client.end();
});

const row = () =>
  db.query.orgSubscriptions.findFirst({
    where: eq(orgSubscriptions.organizationId, ORG_ID),
  });

const state = (status: ProviderSubscriptionStatus) => ({
  status,
  trialEndsAt: null,
  currentPeriodEndsAt: PERIOD_END,
});

describe("applySubscriptionState", () => {
  const cases: [ProviderSubscriptionStatus, string, string][] = [
    ["ACTIVE", "active", "pro"],
    ["PENDING", "pending", "free"],
    ["UNPAID", "past_due", "free"],
    ["EXPIRED", "expired", "free"],
    ["CANCELED", "cancelled", "free"],
    ["UPGRADED", "active", "pro"],
  ];

  for (const [provider, expected, plan] of cases) {
    it(`maps ${provider} to ${expected}`, async () => {
      await applySubscriptionState(ORG_ID, state(provider), "poll");
      const subscription = await row();
      expect(subscription?.status).toBe(expected);
      expect(subscription?.plan).toBe(plan);
      expect(subscription?.currentPeriodEndsAt?.getTime()).toBe(
        PERIOD_END.getTime()
      );
      expect(subscription?.lastSyncedAt).not.toBeNull();
    });
  }

  it("writes one audit row per change and none for a repeat", async () => {
    await applySubscriptionState(ORG_ID, state("ACTIVE"), "poll");
    await applySubscriptionState(ORG_ID, state("ACTIVE"), "poll");
    const events = await db
      .select()
      .from(billingEvents)
      .where(eq(billingEvents.organizationId, ORG_ID));
    expect(events).toHaveLength(1);
    expect(events[0].payload).toMatchObject({ from: "pending", to: "active" });
  });
});

describe("reconcileIfStale", () => {
  it("does not call the provider while the period is still running", async () => {
    await applySubscriptionState(ORG_ID, state("ACTIVE"), "poll");
    providerMock.retrieveSubscription.mockReset();

    await reconcileIfStale(ORG_ID);
    expect(providerMock.retrieveSubscription).not.toHaveBeenCalled();
  });

  it("refreshes once the period has lapsed", async () => {
    await applySubscriptionState(
      ORG_ID,
      {
        status: "ACTIVE",
        trialEndsAt: null,
        currentPeriodEndsAt: new Date(Date.now() - 86_400_000),
      },
      "poll"
    );
    // Pretend the last sync was long ago so the cooldown has elapsed.
    await db
      .update(orgSubscriptions)
      .set({ lastSyncedAt: new Date(Date.now() - 3_600_000) })
      .where(eq(orgSubscriptions.organizationId, ORG_ID));

    providerMock.retrieveSubscription.mockResolvedValue(state("UNPAID"));
    await reconcileIfStale(ORG_ID);

    expect(providerMock.retrieveSubscription).toHaveBeenCalledWith(SUB_REF);
    expect((await row())?.status).toBe("past_due");
  });

  it("survives a provider failure without throwing", async () => {
    await db
      .update(orgSubscriptions)
      .set({
        status: "active",
        currentPeriodEndsAt: new Date(Date.now() - 86_400_000),
        lastSyncedAt: new Date(Date.now() - 3_600_000),
      })
      .where(eq(orgSubscriptions.organizationId, ORG_ID));
    providerMock.retrieveSubscription.mockRejectedValue(
      new Error("iyzico down")
    );

    // A provider hiccup must never break a panel render.
    await expect(reconcileIfStale(ORG_ID)).resolves.toBeUndefined();
    expect((await row())?.status).toBe("active");
  });

  it("skips orgs that never subscribed", async () => {
    await db
      .update(orgSubscriptions)
      .set({ iyzicoSubscriptionRef: null, status: "none" })
      .where(eq(orgSubscriptions.organizationId, ORG_ID));

    await reconcileIfStale(ORG_ID);
    expect(providerMock.retrieveSubscription).not.toHaveBeenCalled();
  });
});
