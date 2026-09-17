/**
 * Renewal billing: idempotency under retry and concurrency, plus dunning.
 * Runs against the local dev database; never touches the live iyzico API.
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

const { chargeMock } = vi.hoisted(() => ({ chargeMock: vi.fn() }));
vi.mock("@/lib/payments", () => ({
  getPaymentProvider: () => ({ chargeStoredCard: chargeMock }),
}));

const { chargeSubscription, dueSubscriptions, RETRY_DAYS } = await import(
  "./charge-subscription"
);
const { db } = await import("@/lib/db");
const { member, organization, user } = await import(
  "@/lib/db/schema/auth-schema"
);
const { orgSubscriptions, subscriptionCharges } = await import(
  "@/lib/db/schema/billing-schema"
);

const ORG_ID = "org_itest_charge";
const SLUG = "itest-charge";
const USER_ID = "user_itest_charge";
const OWNER_EMAIL = "owner@itest.dev";
const MEMBER_ID = "member_itest_charge";
const DAY = 86_400_000;
const NOW = new Date("2026-04-01T06:00:00Z");

const succeed = () =>
  chargeMock.mockResolvedValue({
    paid: true,
    paymentRef: "pay_1",
    errorMessage: null,
  });
const decline = () =>
  chargeMock.mockResolvedValue({
    paid: false,
    paymentRef: null,
    errorMessage: "Yetersiz bakiye",
  });

beforeAll(async () => {
  await db.delete(organization).where(eq(organization.id, ORG_ID));
  await db.delete(user).where(eq(user.id, USER_ID));
  await db.insert(organization).values({
    id: ORG_ID,
    name: "ITest Charge",
    slug: SLUG,
    createdAt: new Date(),
  });
  // The renewal has no session, so the billable email comes from the owner.
  await db.insert(user).values({
    id: USER_ID,
    name: "Ada Lovelace",
    email: OWNER_EMAIL,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await db.insert(member).values({
    id: MEMBER_ID,
    organizationId: ORG_ID,
    userId: USER_ID,
    role: "owner",
    createdAt: new Date(),
  });
});

async function seedSubscription(overrides: Record<string, unknown> = {}) {
  await db
    .delete(orgSubscriptions)
    .where(eq(orgSubscriptions.organizationId, ORG_ID));
  await db
    .delete(subscriptionCharges)
    .where(eq(subscriptionCharges.organizationId, ORG_ID));
  await db.insert(orgSubscriptions).values({
    organizationId: ORG_ID,
    plan: "pro",
    status: "active",
    cardUserKey: "cuk_itest",
    cardToken: "tok_itest",
    currentPeriodEndsAt: new Date(NOW.getTime() - DAY),
    nextChargeAt: new Date(NOW.getTime() - DAY),
    ...overrides,
  });
}

beforeEach(async () => {
  chargeMock.mockReset();
  await seedSubscription();
});

afterAll(async () => {
  await db.delete(organization).where(eq(organization.id, ORG_ID));
  await db.delete(user).where(eq(user.id, USER_ID));
  await db.$client.end();
});

const subscription = () =>
  db.query.orgSubscriptions.findFirst({
    where: eq(orgSubscriptions.organizationId, ORG_ID),
  });
const charges = () =>
  db
    .select()
    .from(subscriptionCharges)
    .where(eq(subscriptionCharges.organizationId, ORG_ID));

describe("chargeSubscription — the happy path", () => {
  it("charges once and moves the period forward", async () => {
    succeed();
    expect(await chargeSubscription(ORG_ID, NOW)).toBe("charged");

    const sub = await subscription();
    expect(sub?.status).toBe("active");
    expect(sub?.plan).toBe("pro");
    // Next charge is 30 days after the period just paid, not after "now".
    expect(sub?.nextChargeAt?.getTime()).toBe(NOW.getTime() - DAY + 30 * DAY);

    const rows = await charges();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("succeeded");
    expect(rows[0].paymentRef).toBe("pay_1");
  });

  it("does nothing when no charge is due", async () => {
    await seedSubscription({
      nextChargeAt: new Date(NOW.getTime() + 10 * DAY),
    });
    succeed();
    expect(await chargeSubscription(ORG_ID, NOW)).toBe("noop");
    expect(chargeMock).not.toHaveBeenCalled();
  });
});

describe("chargeSubscription — who gets billed", () => {
  it("bills the owner's real email, not a synthetic one", async () => {
    // A fabricated address (org-id@rezerve.local) is rejected outright by
    // iyzico — "email hatalı format ile gönderilmiştir" — and every renewal
    // failed. There is no session in a cron, so it comes from the member row.
    succeed();
    await chargeSubscription(ORG_ID, NOW);

    expect(chargeMock).toHaveBeenCalledTimes(1);
    expect(chargeMock.mock.calls[0][0]).toMatchObject({
      organizationId: ORG_ID,
      customerEmail: OWNER_EMAIL,
      customerName: "Ada Lovelace",
      cardUserKey: "cuk_itest",
      cardToken: "tok_itest",
    });
  });

  it("gives up rather than retrying when the org has no owner", async () => {
    await db.delete(member).where(eq(member.organizationId, ORG_ID));
    succeed();

    expect(await chargeSubscription(ORG_ID, NOW)).toBe("exhausted");
    expect(chargeMock).not.toHaveBeenCalled();
    const sub = await subscription();
    expect(sub?.status).toBe("expired");
    expect(sub?.nextChargeAt).toBeNull();

    // Restore it for the tests that follow.
    await db.insert(member).values({
      id: MEMBER_ID,
      organizationId: ORG_ID,
      userId: USER_ID,
      role: "owner",
      createdAt: new Date(),
    });
  });
});

describe("chargeSubscription — cannot double-charge a period", () => {
  it("re-running an already-paid period is a no-op", async () => {
    succeed();
    await chargeSubscription(ORG_ID, NOW);

    // Rewind the subscription to exactly the state it was in before the
    // charge — a stale row, a replayed run, a restored backup. The ledger is
    // the only thing standing between that and a second charge.
    await db
      .update(orgSubscriptions)
      .set({
        nextChargeAt: new Date(NOW.getTime() - DAY),
        currentPeriodEndsAt: new Date(NOW.getTime() - DAY),
      })
      .where(eq(orgSubscriptions.organizationId, ORG_ID));

    expect(await chargeSubscription(ORG_ID, NOW)).toBe("noop");
    expect(chargeMock).toHaveBeenCalledTimes(1);
    expect(await charges()).toHaveLength(1);
  });

  it("does not bill the next period before it is due", async () => {
    succeed();
    await chargeSubscription(ORG_ID, NOW);
    // nextChargeAt is now 30 days out; a re-run must simply find nothing due.
    expect(await chargeSubscription(ORG_ID, NOW)).toBe("noop");
    expect(chargeMock).toHaveBeenCalledTimes(1);
  });

  it("two concurrent runs charge exactly once", async () => {
    succeed();
    const [a, b] = await Promise.all([
      chargeSubscription(ORG_ID, NOW),
      chargeSubscription(ORG_ID, NOW),
    ]);
    // The unique constraint decides the winner; the loser must not charge.
    expect([a, b].filter((r) => r === "charged")).toHaveLength(1);
    expect(chargeMock).toHaveBeenCalledTimes(1);
    expect(await charges()).toHaveLength(1);
  });
});

describe("chargeSubscription — dunning", () => {
  it("a decline drops entitlement to past_due and retries tomorrow", async () => {
    decline();
    expect(await chargeSubscription(ORG_ID, NOW)).toBe("declined");

    const sub = await subscription();
    expect(sub?.status).toBe("past_due");
    expect(sub?.plan).toBe("free");
    expect(sub?.nextChargeAt?.getTime()).toBe(NOW.getTime() + DAY);
    expect((await charges())[0].lastError).toMatch(/Yetersiz bakiye/);
  });

  it(`gives up after ${RETRY_DAYS} attempts and expires`, async () => {
    decline();
    let now = NOW;
    for (let i = 0; i < RETRY_DAYS; i++) {
      await chargeSubscription(ORG_ID, now);
      now = new Date(now.getTime() + DAY);
    }

    const sub = await subscription();
    expect(sub?.status).toBe("expired");
    expect(sub?.nextChargeAt).toBeNull();
    expect(chargeMock).toHaveBeenCalledTimes(RETRY_DAYS);
    // Still one row: retries advance the attempt counter, they don't pile up.
    const rows = await charges();
    expect(rows).toHaveLength(1);
    expect(rows[0].attempt).toBe(RETRY_DAYS);
  });

  it("recovers if a later attempt succeeds", async () => {
    decline();
    await chargeSubscription(ORG_ID, NOW);
    succeed();
    expect(
      await chargeSubscription(ORG_ID, new Date(NOW.getTime() + DAY))
    ).toBe("charged");

    const sub = await subscription();
    expect(sub?.status).toBe("active");
    expect(sub?.plan).toBe("pro");
    expect((await charges())[0].status).toBe("succeeded");
  });
});

describe("chargeSubscription — trials have no card", () => {
  it("lapses a trial to free instead of charging", async () => {
    await seedSubscription({
      status: "trialing",
      cardUserKey: null,
      cardToken: null,
      trialEndsAt: new Date(NOW.getTime() - DAY),
    });
    expect(await chargeSubscription(ORG_ID, NOW)).toBe("trial_expired");

    const sub = await subscription();
    expect(sub?.status).toBe("expired");
    expect(sub?.plan).toBe("free");
    expect(sub?.nextChargeAt).toBeNull();
    expect(chargeMock).not.toHaveBeenCalled();
  });
});

describe("dueSubscriptions", () => {
  it("returns orgs whose charge is due and skips the rest", async () => {
    expect(
      (await dueSubscriptions(NOW)).map((r) => r.organizationId)
    ).toContain(ORG_ID);

    await db
      .update(orgSubscriptions)
      .set({ status: "cancelled" })
      .where(eq(orgSubscriptions.organizationId, ORG_ID));
    expect(
      (await dueSubscriptions(NOW)).map((r) => r.organizationId)
    ).not.toContain(ORG_ID);
  });
});
