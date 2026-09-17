/**
 * Turning a successful first payment into an active subscription, against the
 * local dev database. The card mandate captured here is what every later
 * renewal is charged against, so its absence must never be silent.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { organization } from "@/lib/db/schema/auth-schema";
import {
  billingEvents,
  orgSubscriptions,
  subscriptionCharges,
} from "@/lib/db/schema/billing-schema";
import { activateSubscription } from "./activate-subscription";

const ORG_ID = "org_itest_activate";
const SLUG = "itest-activate";
const CARD_USER_KEY = "cuk_itest";
const CARD_TOKEN = "tok_itest";
const NOW = new Date("2026-04-01T10:00:00Z");

const payment = (cardStored = true) => ({
  cardUserKey: cardStored ? CARD_USER_KEY : null,
  cardToken: cardStored ? CARD_TOKEN : null,
  paymentRef: "pay_itest",
});

beforeAll(async () => {
  await db.delete(organization).where(eq(organization.id, ORG_ID));
  await db.insert(organization).values({
    id: ORG_ID,
    name: "ITest Activate",
    slug: SLUG,
    createdAt: new Date(),
  });
});

beforeEach(async () => {
  await db
    .delete(subscriptionCharges)
    .where(eq(subscriptionCharges.organizationId, ORG_ID));
  await db
    .delete(billingEvents)
    .where(eq(billingEvents.organizationId, ORG_ID));
  await db
    .delete(orgSubscriptions)
    .where(eq(orgSubscriptions.organizationId, ORG_ID));
});

afterAll(async () => {
  await db.delete(organization).where(eq(organization.id, ORG_ID));
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

describe("activateSubscription", () => {
  it("activates and stores the mandate renewals depend on", async () => {
    expect(await activateSubscription(ORG_ID, payment(), NOW)).toBe(
      "activated"
    );

    const sub = await subscription();
    expect(sub?.status).toBe("active");
    expect(sub?.plan).toBe("pro");
    expect(sub?.cardUserKey).toBe(CARD_USER_KEY);
    expect(sub?.cardToken).toBe(CARD_TOKEN);
    // 30 days out, and the cron is armed for exactly then.
    expect(sub?.nextChargeAt?.getTime()).toBe(
      sub?.currentPeriodEndsAt?.getTime()
    );
  });

  it("records the period so the cron cannot re-bill it", async () => {
    await activateSubscription(ORG_ID, payment(), NOW);
    const rows = await charges();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("succeeded");
    expect(rows[0].paymentRef).toBe("pay_itest");
  });

  it("is a no-op on a double-submitted form", async () => {
    await activateSubscription(ORG_ID, payment(), NOW);
    const before = await subscription();

    expect(await activateSubscription(ORG_ID, payment(), NOW)).toBe("noop");
    const after = await subscription();
    // The renewal date must not slide forward on a duplicate submit.
    expect(after?.currentPeriodEndsAt?.getTime()).toBe(
      before?.currentPeriodEndsAt?.getTime()
    );
    expect(await charges()).toHaveLength(1);
  });

  it("leaves the cron disarmed when no card came back", async () => {
    // The failure that shipped once: payment succeeds, no mandate captured.
    // Arming the cron here would make it fail every day forever.
    await activateSubscription(ORG_ID, payment(false), NOW);
    const sub = await subscription();
    expect(sub?.status).toBe("active");
    expect(sub?.cardToken).toBeNull();
    expect(sub?.nextChargeAt).toBeNull();
  });

  it("says plainly in the audit trail whether a card was stored", async () => {
    await activateSubscription(ORG_ID, payment(false), NOW);
    const [event] = await db
      .select()
      .from(billingEvents)
      .where(eq(billingEvents.organizationId, ORG_ID));
    expect(event.kind).toBe("subscription.active");
    expect(event.payload).toMatchObject({ cardStored: false });
  });
});
