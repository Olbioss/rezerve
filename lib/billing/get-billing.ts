import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  orgPayoutAccounts,
  orgSubscriptions,
} from "@/lib/db/schema/billing-schema";
import { type Entitlements, resolveEntitlements } from "./entitlements";

export type Subscription = typeof orgSubscriptions.$inferSelect;
export type PayoutAccount = typeof orgPayoutAccounts.$inferSelect;

export type Billing = Entitlements & {
  subscription: Subscription | null;
  payoutAccount: PayoutAccount | null;
};

/**
 * The org's entitlements plus the rows they were derived from.
 *
 * Two indexed single-row reads and no network: reconciliation with iyzico is
 * deliberately elsewhere (lib/billing/sync-subscription.ts), so nothing on a
 * panel render or the public booking path can block on an API call.
 */
export async function getBilling(organizationId: string): Promise<Billing> {
  const [subscription, payoutAccount] = await Promise.all([
    db.query.orgSubscriptions.findFirst({
      where: eq(orgSubscriptions.organizationId, organizationId),
    }),
    db.query.orgPayoutAccounts.findFirst({
      where: eq(orgPayoutAccounts.organizationId, organizationId),
    }),
  ]);
  return {
    ...resolveEntitlements(subscription ?? null, payoutAccount ?? null),
    subscription: subscription ?? null,
    payoutAccount: payoutAccount ?? null,
  };
}
