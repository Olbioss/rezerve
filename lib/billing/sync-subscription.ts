import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  billingEvents,
  orgSubscriptions,
} from "@/lib/db/schema/billing-schema";
import { getPaymentProvider } from "@/lib/payments";
import type {
  ProviderSubscriptionStatus,
  SubscriptionState,
} from "@/lib/payments/provider";
import type { SubscriptionStatus } from "./entitlements";

/**
 * The single writer for subscription state.
 *
 * Every source — the checkout callback, a manual fix, the lazy poll below —
 * lands here, so status mapping and the audit trail exist in one place.
 */

const STATUS_MAP: Record<ProviderSubscriptionStatus, SubscriptionStatus> = {
  ACTIVE: "active",
  PENDING: "pending",
  UNPAID: "past_due",
  EXPIRED: "expired",
  CANCELED: "cancelled",
  // An upgrade replaces the subscription; the new one is the live record.
  UPGRADED: "active",
};

/** Re-poll no more often than this once a period boundary has passed. */
const RECONCILE_COOLDOWN_MS = 10 * 60_000;

export async function applySubscriptionState(
  organizationId: string,
  state: SubscriptionState,
  source: "callback" | "poll" | "manual"
): Promise<SubscriptionStatus> {
  const status = STATUS_MAP[state.status];
  const previous = await db.query.orgSubscriptions.findFirst({
    where: eq(orgSubscriptions.organizationId, organizationId),
  });

  await db
    .update(orgSubscriptions)
    .set({
      status,
      plan: status === "active" || status === "trialing" ? "pro" : "free",
      trialEndsAt: state.trialEndsAt,
      currentPeriodEndsAt: state.currentPeriodEndsAt,
      lastSyncedAt: new Date(),
    })
    .where(eq(orgSubscriptions.organizationId, organizationId));

  // Only a real transition is worth an audit row; a no-op re-sync is noise.
  if (previous && previous.status !== status) {
    await db.insert(billingEvents).values({
      organizationId,
      source,
      kind: `subscription.${status}`,
      iyzicoRef: previous.iyzicoSubscriptionRef,
      payload: { from: previous.status, to: status },
    });
  }
  return status;
}

/**
 * Refresh from the provider, but only when the cached period has actually
 * lapsed and we haven't just looked.
 *
 * Renewals happen with nobody present, so state can only go stale after a
 * period boundary — before that a poll would tell us nothing new. A null
 * period end counts as stale so an unsynced active row heals itself.
 */
export async function reconcileIfStale(organizationId: string): Promise<void> {
  const subscription = await db.query.orgSubscriptions.findFirst({
    where: eq(orgSubscriptions.organizationId, organizationId),
  });
  if (!subscription?.iyzicoSubscriptionRef) return;
  if (!["active", "trialing", "past_due"].includes(subscription.status)) return;

  const now = Date.now();
  const periodLapsed =
    subscription.currentPeriodEndsAt === null ||
    subscription.currentPeriodEndsAt.getTime() <= now;
  const cooledDown =
    subscription.lastSyncedAt === null ||
    now - subscription.lastSyncedAt.getTime() > RECONCILE_COOLDOWN_MS;
  if (!periodLapsed || !cooledDown) return;

  try {
    const state = await getPaymentProvider().retrieveSubscription(
      subscription.iyzicoSubscriptionRef
    );
    await applySubscriptionState(organizationId, state, "poll");
  } catch (err) {
    // A provider hiccup must never break a panel render; try again later.
    console.error("Subscription reconcile failed:", err);
  }
}
