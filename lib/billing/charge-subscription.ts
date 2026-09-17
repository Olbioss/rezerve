import "server-only";
import { and, eq, isNotNull, lte, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { member, organization, user } from "@/lib/db/schema/auth-schema";
import {
  billingEvents,
  orgSubscriptions,
  subscriptionCharges,
} from "@/lib/db/schema/billing-schema";
import { getPaymentProvider } from "@/lib/payments";
import { PRO_PRICE_CENTS } from "./plans";

/**
 * Renewal billing.
 *
 * Abonelik is unavailable on a marketplace account, so Rezerve owns the
 * schedule: a daily cron charges every subscription whose nextChargeAt has
 * passed, against the card stored by the first checkout.
 *
 * Charging twice for one period is prevented by the database, not by care —
 * subscription_charges is UNIQUE (organization_id, period_start), so a
 * retried or overlapping run loses the insert. Retries then advance an
 * attempt counter under an optimistic lock, so two concurrent runs cannot
 * both charge the same retry.
 */

export const RENEWAL_INTERVAL_DAYS = 30;
/** Matches PAST_DUE_GRACE_DAYS so entitlement and retries expire together. */
export const RETRY_DAYS = 3;

const DAY_MS = 86_400_000;

export type ChargeOutcome =
  | "charged"
  | "declined"
  | "exhausted"
  | "trial_expired"
  | "noop";

/**
 * The period a charge covers, as a date — the idempotency key.
 *
 * Derived from currentPeriodEndsAt, never from nextChargeAt: a decline moves
 * nextChargeAt to tomorrow, so keying on it would open a brand-new billing
 * period for every retry and bill the customer once per attempt.
 */
function periodKey(at: Date): string {
  return at.toISOString().slice(0, 10);
}

async function logEvent(
  organizationId: string,
  kind: string,
  payload: Record<string, unknown>
) {
  await db.insert(billingEvents).values({
    organizationId,
    source: "poll",
    kind,
    payload,
  });
}

/**
 * Attempt one subscription's due charge.
 *
 * Safe to call concurrently and safe to call when nothing is due.
 */
export async function chargeSubscription(
  organizationId: string,
  now: Date = new Date()
): Promise<ChargeOutcome> {
  const subscription = await db.query.orgSubscriptions.findFirst({
    where: eq(orgSubscriptions.organizationId, organizationId),
  });
  if (!subscription?.nextChargeAt) return "noop";
  if (subscription.nextChargeAt.getTime() > now.getTime()) return "noop";
  if (!["trialing", "active", "past_due"].includes(subscription.status)) {
    return "noop";
  }

  // A trial ends without a card: capture requires a payment on this account,
  // so a trialling org has nothing to charge. It simply lapses to free.
  if (!subscription.cardToken || !subscription.cardUserKey) {
    await db
      .update(orgSubscriptions)
      .set({ status: "expired", plan: "free", nextChargeAt: null })
      .where(eq(orgSubscriptions.organizationId, organizationId));
    await logEvent(organizationId, "subscription.trial_expired", {});
    return "trial_expired";
  }

  const periodAnchor =
    subscription.currentPeriodEndsAt ?? subscription.nextChargeAt;
  const period = periodKey(periodAnchor);

  // Claim the period. A conflict means some other run already has it.
  const claimed = await db
    .insert(subscriptionCharges)
    .values({
      organizationId,
      periodStart: period,
      status: "failed",
      amountCents: PRO_PRICE_CENTS,
      attempt: 1,
    })
    .onConflictDoNothing({
      target: [
        subscriptionCharges.organizationId,
        subscriptionCharges.periodStart,
      ],
    })
    .returning();

  let charge = claimed[0];
  if (!charge) {
    const existing = await db.query.subscriptionCharges.findFirst({
      where: and(
        eq(subscriptionCharges.organizationId, organizationId),
        eq(subscriptionCharges.periodStart, period)
      ),
    });
    if (!existing || existing.status === "succeeded") return "noop";
    if (existing.attempt >= RETRY_DAYS) return "noop";

    // Optimistic lock on the attempt counter: only one run advances it.
    const [bumped] = await db
      .update(subscriptionCharges)
      .set({ attempt: existing.attempt + 1 })
      .where(
        and(
          eq(subscriptionCharges.id, existing.id),
          eq(subscriptionCharges.attempt, existing.attempt)
        )
      )
      .returning();
    if (!bumped) return "noop";
    charge = bumped;
  }

  // The owner's real email: iyzico validates it, and a synthetic address is
  // rejected outright ("email hatalı format ile gönderilmiştir"). There is no
  // session here, so it comes from the organization's owning member.
  const [owner] = await db
    .select({ orgName: organization.name, email: user.email, name: user.name })
    .from(organization)
    .innerJoin(member, eq(member.organizationId, organization.id))
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(organization.id, organizationId))
    .limit(1);

  if (!owner?.email) {
    // Nobody to bill against; retrying daily would not help.
    await db
      .update(orgSubscriptions)
      .set({ status: "expired", plan: "free", nextChargeAt: null })
      .where(eq(orgSubscriptions.organizationId, organizationId));
    await logEvent(organizationId, "subscription.no_billable_owner", {
      period,
    });
    return "exhausted";
  }

  const result = await getPaymentProvider().chargeStoredCard({
    organizationId,
    cardUserKey: subscription.cardUserKey,
    cardToken: subscription.cardToken,
    amountCents: PRO_PRICE_CENTS,
    customerName: owner.name ?? owner.orgName ?? "Rezerve",
    customerEmail: owner.email,
    label: "Rezerve Pro — aylık abonelik",
  });

  if (result.paid) {
    const periodEnd = new Date(
      periodAnchor.getTime() + RENEWAL_INTERVAL_DAYS * DAY_MS
    );
    await db
      .update(subscriptionCharges)
      .set({ status: "succeeded", paymentRef: result.paymentRef })
      .where(eq(subscriptionCharges.id, charge.id));
    await db
      .update(orgSubscriptions)
      .set({
        status: "active",
        plan: "pro",
        currentPeriodEndsAt: periodEnd,
        nextChargeAt: periodEnd,
        lastSyncedAt: now,
      })
      .where(eq(orgSubscriptions.organizationId, organizationId));
    await logEvent(organizationId, "subscription.renewed", {
      period,
      paymentRef: result.paymentRef,
    });
    return "charged";
  }

  await db
    .update(subscriptionCharges)
    .set({ lastError: result.errorMessage })
    .where(eq(subscriptionCharges.id, charge.id));

  const exhausted = charge.attempt >= RETRY_DAYS;
  await db
    .update(orgSubscriptions)
    .set({
      status: exhausted ? "expired" : "past_due",
      plan: "free",
      // Retry tomorrow, or stop.
      nextChargeAt: exhausted ? null : new Date(now.getTime() + DAY_MS),
      lastSyncedAt: now,
    })
    .where(eq(orgSubscriptions.organizationId, organizationId));

  await logEvent(
    organizationId,
    exhausted
      ? "subscription.dunning_exhausted"
      : "subscription.payment_failed",
    { period, attempt: charge.attempt, error: result.errorMessage }
  );
  return exhausted ? "exhausted" : "declined";
}

/** Every organization with a charge due. Drives the cron. */
export async function dueSubscriptions(now: Date = new Date()) {
  return db
    .select({ organizationId: orgSubscriptions.organizationId })
    .from(orgSubscriptions)
    .where(
      and(
        isNotNull(orgSubscriptions.nextChargeAt),
        lte(orgSubscriptions.nextChargeAt, now),
        or(
          eq(orgSubscriptions.status, "trialing"),
          eq(orgSubscriptions.status, "active"),
          eq(orgSubscriptions.status, "past_due")
        )
      )
    );
}
