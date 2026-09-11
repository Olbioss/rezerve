/**
 * getBilling reads the subscription and payout rows in one join. Each row is
 * independently optional, so all four shapes have to be checked — a wrong
 * join here would silently mis-resolve every entitlement in the product.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { organization } from "@/lib/db/schema/auth-schema";
import {
  orgPayoutAccounts,
  orgSubscriptions,
} from "@/lib/db/schema/billing-schema";
import { getBilling } from "./get-billing";

const ORG_ID = "org_itest_getbilling";
const SLUG = "itest-getbilling";
const MONTH_OUT = new Date(Date.now() + 30 * 86_400_000);

beforeAll(async () => {
  await db.delete(organization).where(eq(organization.id, ORG_ID));
  await db.insert(organization).values({
    id: ORG_ID,
    name: "ITest Billing",
    slug: SLUG,
    createdAt: new Date(),
  });
});

beforeEach(async () => {
  await db
    .delete(orgSubscriptions)
    .where(eq(orgSubscriptions.organizationId, ORG_ID));
  await db
    .delete(orgPayoutAccounts)
    .where(eq(orgPayoutAccounts.organizationId, ORG_ID));
});

afterAll(async () => {
  await db.delete(organization).where(eq(organization.id, ORG_ID));
  await db.$client.end();
});

const addSubscription = () =>
  db.insert(orgSubscriptions).values({
    organizationId: ORG_ID,
    plan: "pro",
    status: "active",
    currentPeriodEndsAt: MONTH_OUT,
  });

const addPayout = (status: "active" | "pending") =>
  db.insert(orgPayoutAccounts).values({
    organizationId: ORG_ID,
    status,
    subMerchantKey: status === "active" ? "sm_itest" : null,
    subMerchantExternalId: ORG_ID,
    merchantType: "personal",
    name: "ITest",
    contactName: "Ada",
    contactSurname: "Lovelace",
    identityNumber: "10000000146",
    iban: "TR180006200119000006672315",
    address: "Kadıköy/İstanbul",
    gsmNumber: "+905350000000",
    email: "itest@test.dev",
  });

describe("getBilling — every combination of the two optional rows", () => {
  it("neither row: free, and nothing blows up on the empty join", async () => {
    const billing = await getBilling(ORG_ID);
    expect(billing.subscription).toBeNull();
    expect(billing.payoutAccount).toBeNull();
    expect(billing.plan).toBe("free");
    expect(billing.onlineDeposit).toBe(false);
    expect(billing.reason).toBe("free");
  });

  it("subscription only: Pro, but nowhere to send the money", async () => {
    await addSubscription();
    const billing = await getBilling(ORG_ID);
    expect(billing.subscription?.status).toBe("active");
    expect(billing.payoutAccount).toBeNull();
    expect(billing.plan).toBe("pro");
    expect(billing.onlineDeposit).toBe(false);
    expect(billing.reason).toBe("no_payout_account");
  });

  it("payout only: still free, and the payout row is returned", async () => {
    // The half that a naive inner join would drop entirely.
    await addPayout("active");
    const billing = await getBilling(ORG_ID);
    expect(billing.subscription).toBeNull();
    expect(billing.payoutAccount?.status).toBe("active");
    expect(billing.plan).toBe("free");
    expect(billing.reason).toBe("free");
  });

  it("both rows: entitled", async () => {
    await addSubscription();
    await addPayout("active");
    const billing = await getBilling(ORG_ID);
    expect(billing.subscription?.status).toBe("active");
    expect(billing.payoutAccount?.status).toBe("active");
    expect(billing.onlineDeposit).toBe(true);
    expect(billing.reason).toBe("active");
  });

  it("both rows, payout unapproved: Pro but kapora still off", async () => {
    await addSubscription();
    await addPayout("pending");
    const billing = await getBilling(ORG_ID);
    expect(billing.onlineDeposit).toBe(false);
    expect(billing.reason).toBe("payout_pending");
  });

  it("reads nothing belonging to another organization", async () => {
    await addSubscription();
    await addPayout("active");
    const other = await getBilling("org_does_not_exist");
    expect(other.subscription).toBeNull();
    expect(other.payoutAccount).toBeNull();
  });
});
