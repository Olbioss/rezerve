import type {
  orgPayoutAccounts,
  orgSubscriptions,
} from "@/lib/db/schema/billing-schema";
import type { Plan } from "./plans";

// Type-only imports: erased at build time, so this module stays pure and
// dependency-free while its vocabularies can never drift from the schema.
export type SubscriptionStatus =
  (typeof orgSubscriptions.$inferSelect)["status"];
export type PayoutStatus = (typeof orgPayoutAccounts.$inferSelect)["status"];

export type SubscriptionSnapshot = {
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
  currentPeriodEndsAt: Date | null;
};

/**
 * Why the org is (or isn't) entitled. Every banner and CTA in the panel keys
 * off this rather than re-deriving the rules, so the copy can't disagree with
 * the enforcement.
 */
export type EntitlementReason =
  | "free"
  | "expired"
  | "no_payout_account"
  | "payout_pending"
  | "trialing"
  | "active"
  | "past_due"
  /** Still entitled, but not renewing — the period is being served out. */
  | "cancelled";

export type Entitlements = {
  plan: Plan;
  onlineDeposit: boolean;
  reason: EntitlementReason;
};

/**
 * iyzico retries a failed recurring charge for a few days. Cutting kapora off
 * on the first bounce would strand in-flight bookings for a card that will
 * most likely clear, so past_due keeps its entitlement this much longer.
 */
export const PAST_DUE_GRACE_DAYS = 3;

const DAY_MS = 86_400_000;

/** Strictly future: an end date exactly equal to `now` has elapsed. */
function isFuture(date: Date | null, now: Date): boolean {
  return date !== null && date.getTime() > now.getTime();
}

/**
 * Is the org inside a window it has paid (or is trialling) for?
 *
 * A null end date on a *positive* status means "active, end date not synced
 * yet" — we trust the status and let reconciliation fill the date in, rather
 * than locking out someone who is genuinely paying. On a negative status the
 * asymmetry flips: without an explicit paid-through date, they're done.
 */
function isPaidWindow(sub: SubscriptionSnapshot, now: Date): boolean {
  switch (sub.status) {
    case "trialing": {
      const ends = sub.trialEndsAt ?? sub.currentPeriodEndsAt;
      return ends === null || isFuture(ends, now);
    }
    case "active":
      return (
        sub.currentPeriodEndsAt === null ||
        isFuture(sub.currentPeriodEndsAt, now)
      );
    // Cancelled but not yet lapsed: they paid for this period, serve it out.
    case "cancelled":
      return isFuture(sub.currentPeriodEndsAt, now);
    case "past_due":
      return isFuture(
        sub.currentPeriodEndsAt === null
          ? null
          : new Date(
              sub.currentPeriodEndsAt.getTime() + PAST_DUE_GRACE_DAYS * DAY_MS
            ),
        now
      );
    default:
      // none | pending | expired
      return false;
  }
}

/** Never subscribed reads as "free"; lapsed reads as "expired". */
function lapsedReason(sub: SubscriptionSnapshot | null): EntitlementReason {
  if (!sub) return "free";
  if (sub.status === "none" || sub.status === "pending") return "free";
  return "expired";
}

function paidReason(status: SubscriptionStatus): EntitlementReason {
  if (status === "trialing") return "trialing";
  if (status === "past_due") return "past_due";
  // Distinct from "active" on purpose: entitlement is the same, but the panel
  // has to say it is ending, and must not offer to cancel it twice.
  if (status === "cancelled") return "cancelled";
  return "active";
}

/**
 * Resolve what an organization may do, from its subscription and payout rows.
 *
 * Pure: no DB, no network, and `now` is injected — the same discipline as
 * computeSlotsForDay, and what makes this exhaustively testable.
 *
 * Online kapora needs *two* independent things: a paid window, and somewhere
 * for the money to land. Being Pro with no approved submerchant is not enough.
 */
export function resolveEntitlements(
  sub: SubscriptionSnapshot | null,
  payout: { status: PayoutStatus } | null,
  now: Date = new Date()
): Entitlements {
  if (!sub || !isPaidWindow(sub, now)) {
    return { plan: "free", onlineDeposit: false, reason: lapsedReason(sub) };
  }
  if (!payout) {
    return { plan: "pro", onlineDeposit: false, reason: "no_payout_account" };
  }
  if (payout.status !== "active") {
    return { plan: "pro", onlineDeposit: false, reason: "payout_pending" };
  }
  return { plan: "pro", onlineDeposit: true, reason: paidReason(sub.status) };
}
