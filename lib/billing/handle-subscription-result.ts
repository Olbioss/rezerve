import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { orgSubscriptions } from "@/lib/db/schema/billing-schema";
import { getPaymentProvider } from "@/lib/payments";
import { applySubscriptionState } from "./sync-subscription";

/**
 * Subscription-callback business logic, separated from the route for testing.
 *
 * Idempotent by construction, exactly like the booking payment callback: the
 * transition is a guarded UPDATE on status='pending' AND the stored checkout
 * token, so duplicate callbacks, replayed tokens and out-of-order results
 * match zero rows and change nothing.
 */

export type SubscriptionOutcome = "activated" | "failed" | "noop";

export async function handleSubscriptionResult(
  token: string
): Promise<{ outcome: SubscriptionOutcome; organizationId: string | null }> {
  const result = await getPaymentProvider().retrieveSubscriptionCheckout(token);

  // Trust the stored token over anything the browser said.
  const pending = await db.query.orgSubscriptions.findFirst({
    where: eq(orgSubscriptions.checkoutToken, token),
  });
  if (!pending) return { outcome: "noop", organizationId: null };

  if (!result.paid) {
    const [failed] = await db
      .update(orgSubscriptions)
      .set({ status: "none", checkoutToken: null })
      .where(
        and(
          eq(orgSubscriptions.organizationId, pending.organizationId),
          eq(orgSubscriptions.checkoutToken, token),
          eq(orgSubscriptions.status, "pending")
        )
      )
      .returning();
    return {
      outcome: failed ? "failed" : "noop",
      organizationId: pending.organizationId,
    };
  }

  const [claimed] = await db
    .update(orgSubscriptions)
    .set({
      iyzicoSubscriptionRef: result.subscriptionRef,
      iyzicoCustomerRef: result.customerRef,
      checkoutToken: null,
    })
    .where(
      and(
        eq(orgSubscriptions.organizationId, pending.organizationId),
        eq(orgSubscriptions.checkoutToken, token),
        eq(orgSubscriptions.status, "pending")
      )
    )
    .returning();
  if (!claimed) {
    return { outcome: "noop", organizationId: pending.organizationId };
  }

  const state = result.subscriptionRef
    ? await getPaymentProvider().retrieveSubscription(result.subscriptionRef)
    : {
        status: "ACTIVE" as const,
        trialEndsAt: null,
        currentPeriodEndsAt: null,
      };
  await applySubscriptionState(pending.organizationId, state, "callback");

  return { outcome: "activated", organizationId: pending.organizationId };
}
