import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  billingEvents,
  orgSubscriptions,
  subscriptionCharges,
} from "@/lib/db/schema/billing-schema";
import { RENEWAL_INTERVAL_DAYS } from "./charge-subscription";
import { PRO_PRICE_CENTS } from "./plans";

/**
 * Turn a successful first payment into an active subscription.
 *
 * Separated from the action so it can be tested without a session, and
 * idempotent through the same ledger the renewal cron uses: the period row is
 * UNIQUE (organization_id, period_start), so a double-submitted form cannot
 * record two charges for the same period.
 *
 * This is where the card mandate is captured — everything the renewal cron
 * later charges comes from here.
 */

export type ActivationOutcome = "activated" | "noop";

const DAY_MS = 86_400_000;

export async function activateSubscription(
  organizationId: string,
  payment: {
    cardUserKey: string | null;
    cardToken: string | null;
    paymentRef: string | null;
  },
  now: Date = new Date()
): Promise<ActivationOutcome> {
  const period = now.toISOString().slice(0, 10);

  // Claim the period first: if this org already paid today, stop here rather
  // than resetting their renewal date from a duplicate submit.
  const [claimed] = await db
    .insert(subscriptionCharges)
    .values({
      organizationId,
      periodStart: period,
      status: "succeeded",
      amountCents: PRO_PRICE_CENTS,
      paymentRef: payment.paymentRef,
    })
    .onConflictDoNothing({
      target: [
        subscriptionCharges.organizationId,
        subscriptionCharges.periodStart,
      ],
    })
    .returning();
  if (!claimed) return "noop";

  const periodEnd = new Date(now.getTime() + RENEWAL_INTERVAL_DAYS * DAY_MS);
  const previous = await db.query.orgSubscriptions.findFirst({
    where: eq(orgSubscriptions.organizationId, organizationId),
  });

  const columns = {
    plan: "pro" as const,
    status: "active" as const,
    cardUserKey: payment.cardUserKey,
    cardToken: payment.cardToken,
    currentPeriodEndsAt: periodEnd,
    // Without a stored card there is nothing to charge, so leave the cron
    // alone rather than have it wake up and fail every day.
    nextChargeAt: payment.cardToken ? periodEnd : null,
    trialEndsAt: null,
    checkoutToken: null,
    cancelAtPeriodEnd: false,
    lastSyncedAt: now,
  };

  await db
    .insert(orgSubscriptions)
    .values({ organizationId, ...columns })
    .onConflictDoUpdate({
      target: orgSubscriptions.organizationId,
      set: columns,
    });

  await db.insert(billingEvents).values({
    organizationId,
    source: "callback",
    kind: "subscription.active",
    iyzicoRef: payment.paymentRef,
    payload: {
      from: previous?.status ?? "none",
      to: "active",
      cardStored: Boolean(payment.cardToken),
    },
  });

  return "activated";
}
