import "server-only";
import { eq, or } from "drizzle-orm";
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
  // Both rows are 1:1 with the organization, so one join beats two queries.
  const [row] = await db
    .select({
      subscription: orgSubscriptions,
      payoutAccount: orgPayoutAccounts,
    })
    .from(orgSubscriptions)
    .fullJoin(
      orgPayoutAccounts,
      eq(orgPayoutAccounts.organizationId, orgSubscriptions.organizationId)
    )
    .where(
      or(
        eq(orgSubscriptions.organizationId, organizationId),
        eq(orgPayoutAccounts.organizationId, organizationId)
      )
    )
    .limit(1);

  const subscription = row?.subscription ?? null;
  const payoutAccount = row?.payoutAccount ?? null;
  return {
    ...resolveEntitlements(subscription, payoutAccount),
    subscription,
    payoutAccount,
  };
}
