import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  billingEvents,
  orgSubscriptions,
  subscriptionCharges,
} from "@/lib/db/schema/billing-schema";
import { getPaymentProvider } from "@/lib/payments";
import { RENEWAL_INTERVAL_DAYS } from "./charge-subscription";
import { PRO_PRICE_CENTS } from "./plans";

/**
 * Subscription-callback business logic, separated from the route for testing.
 *
 * Idempotent by construction, exactly like the booking payment callback: the
 * transition is a guarded UPDATE on status='pending' AND the stored checkout
 * token, so duplicate callbacks, replayed tokens and out-of-order results
 * match zero rows and change nothing.
 *
 * This is also where the card mandate is captured — the first payment is what
 * stores the card that every later renewal is charged against.
 */

export type SubscriptionOutcome = "activated" | "failed" | "noop";

const DAY_MS = 86_400_000;

export async function handleSubscriptionResult(
  token: string
): Promise<{ outcome: SubscriptionOutcome; organizationId: string | null }> {
  const result = await getPaymentProvider().retrieveSubscriptionCheckout(token);

  // Trust the stored token over anything the browser said.
  const pending = await db.query.orgSubscriptions.findFirst({
    where: eq(orgSubscriptions.checkoutToken, token),
  });
  if (!pending) return { outcome: "noop", organizationId: null };

  const guard = and(
    eq(orgSubscriptions.organizationId, pending.organizationId),
    eq(orgSubscriptions.checkoutToken, token),
    eq(orgSubscriptions.status, "pending")
  );

  if (!result.paid) {
    const [failed] = await db
      .update(orgSubscriptions)
      .set({ status: "none", plan: "free", checkoutToken: null })
      .where(guard)
      .returning();
    return {
      outcome: failed ? "failed" : "noop",
      organizationId: pending.organizationId,
    };
  }

  const now = new Date();
  const periodEnd = new Date(now.getTime() + RENEWAL_INTERVAL_DAYS * DAY_MS);

  const [claimed] = await db
    .update(orgSubscriptions)
    .set({
      status: "active",
      plan: "pro",
      cardUserKey: result.cardUserKey,
      cardToken: result.cardToken,
      currentPeriodEndsAt: periodEnd,
      // No card stored means renewals can't run; leave nextChargeAt null so
      // the cron doesn't spin on it, and let the period simply lapse.
      nextChargeAt: result.cardToken ? periodEnd : null,
      trialEndsAt: null,
      checkoutToken: null,
      lastSyncedAt: now,
    })
    .where(guard)
    .returning();

  if (!claimed) {
    return { outcome: "noop", organizationId: pending.organizationId };
  }

  // Record the period this payment covered, so the cron can't re-bill it.
  await db
    .insert(subscriptionCharges)
    .values({
      organizationId: pending.organizationId,
      periodStart: now.toISOString().slice(0, 10),
      status: "succeeded",
      amountCents: PRO_PRICE_CENTS,
      paymentRef: result.paymentRef,
    })
    .onConflictDoNothing({
      target: [
        subscriptionCharges.organizationId,
        subscriptionCharges.periodStart,
      ],
    });

  await db.insert(billingEvents).values({
    organizationId: pending.organizationId,
    source: "callback",
    kind: "subscription.active",
    iyzicoRef: result.paymentRef,
    payload: {
      from: pending.status,
      to: "active",
      cardStored: !!result.cardToken,
    },
  });

  return { outcome: "activated", organizationId: pending.organizationId };
}
