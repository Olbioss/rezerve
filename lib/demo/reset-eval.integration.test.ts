/**
 * The eval harness's business: the Pro demo's services and hours with no
 * booking history, so a scripted conversation knows which times are free —
 * and one run puts it back after a scenario has used it.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const { resetEvalBusiness } = await import("./reset");
const { DEMO_ACCOUNTS, DEMO_EVAL } = await import("./credentials");
const { db } = await import("@/lib/db");
const { organization, user } = await import("@/lib/db/schema/auth-schema");
const { availabilityRules } = await import(
  "@/lib/db/schema/availability-schema"
);
const { orgPayoutAccounts, orgSubscriptions } = await import(
  "@/lib/db/schema/billing-schema"
);
const { bookings } = await import("@/lib/db/schema/booking-schema");
const { businessProfiles } = await import("@/lib/db/schema/business-schema");
const { services } = await import("@/lib/db/schema/service-schema");

const ORG = DEMO_EVAL.orgId;
const KEY = "itest-eval-submerchant-key";

async function cleanUp() {
  await db.delete(organization).where(eq(organization.id, ORG));
  await db.delete(user).where(eq(user.email, DEMO_EVAL.email));
}

beforeAll(cleanUp);
afterAll(async () => {
  await cleanUp();
  await db.$client.end();
});

describe("resetEvalBusiness", () => {
  it("seeds the Pro demo's setup, switched on for the assistant, with no bookings", async () => {
    expect(await resetEvalBusiness({ subMerchantKey: KEY })).toEqual({
      bookings: 0,
      slugRestored: true,
      collectsKapora: true,
    });

    const [org, profile, svc, rules, rows, sub, payout] = await Promise.all([
      db.query.organization.findFirst({ where: eq(organization.id, ORG) }),
      db.query.businessProfiles.findFirst({
        where: eq(businessProfiles.organizationId, ORG),
      }),
      db.query.services.findMany({ where: eq(services.organizationId, ORG) }),
      db.query.availabilityRules.findMany({
        where: eq(availabilityRules.organizationId, ORG),
      }),
      db.query.bookings.findMany({ where: eq(bookings.organizationId, ORG) }),
      db.query.orgSubscriptions.findFirst({
        where: eq(orgSubscriptions.organizationId, ORG),
      }),
      db.query.orgPayoutAccounts.findFirst({
        where: eq(orgPayoutAccounts.organizationId, ORG),
      }),
    ]);
    expect(org?.slug).toBe("eval");
    expect(profile?.assistantEnabled).toBe(true);
    expect(profile?.timezone).toBe("Europe/Istanbul");
    expect(svc.map((s) => s.name).sort()).toEqual([
      "Cilt Bakımı",
      "Manikür",
      "Saç Kesimi",
    ]);
    expect(rules).toHaveLength(12);
    expect(rows).toHaveLength(0);
    expect(sub).toMatchObject({ plan: "pro", status: "active" });
    expect(payout?.subMerchantKey).toBe(KEY);
  });

  it("clears whatever a scenario left behind", async () => {
    const [service] = await db.query.services.findMany({
      where: eq(services.organizationId, ORG),
    });
    const startsAt = new Date(Date.now() + 86_400_000);
    await db.insert(bookings).values({
      organizationId: ORG,
      serviceId: service.id,
      customerName: "Senaryo Müşterisi",
      startsAt,
      endsAt: new Date(startsAt.getTime() + service.durationMinutes * 60_000),
      source: "assistant",
      customerRef: `eval:${"a".repeat(26)}`,
    });

    await resetEvalBusiness({ subMerchantKey: KEY });

    expect(
      await db.query.bookings.findMany({
        where: eq(bookings.organizationId, ORG),
      })
    ).toHaveLength(0);
  });

  it("is never published, so the nightly reset leaves it alone", () => {
    expect(DEMO_ACCOUNTS.map((demo) => demo.orgId)).not.toContain(ORG);
  });
});
