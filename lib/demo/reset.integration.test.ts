/**
 * The nightly demo reset. The logins are public, so the tests play the
 * visitor: rename it, move it, strip it, close it, start a trial on the free
 * plan — and check one run puts every piece back, and touches nothing else.
 */
import { and, eq, inArray, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const { resetDemo } = await import("./reset");
const { DEMO_ACCOUNTS, DEMO_FREE, DEMO_PRO } = await import("./credentials");
const { db } = await import("@/lib/db");
const { member, organization, user } = await import(
  "@/lib/db/schema/auth-schema"
);
const { availabilityExceptions, availabilityRules } = await import(
  "@/lib/db/schema/availability-schema"
);
const { orgPayoutAccounts, orgSubscriptions } = await import(
  "@/lib/db/schema/billing-schema"
);
const { bookings } = await import("@/lib/db/schema/booking-schema");
const { businessProfiles } = await import("@/lib/db/schema/business-schema");
const { services } = await import("@/lib/db/schema/service-schema");

const DEMO_IDS = DEMO_ACCOUNTS.map((d) => d.orgId);
const DEMO_EMAILS = DEMO_ACCOUNTS.map((d) => d.email);
const BYSTANDER = "org_itest_demo_bystander";
const KEY = "itest-submerchant-key";

async function cleanUp() {
  await db
    .delete(organization)
    .where(inArray(organization.id, [...DEMO_IDS, BYSTANDER]));
  await db.delete(user).where(inArray(user.email, DEMO_EMAILS));
}

async function stateOf(orgId: string) {
  const [org, profile, svc, rules, exceptions, rows, owner, sub, payout] =
    await Promise.all([
      db.query.organization.findFirst({ where: eq(organization.id, orgId) }),
      db.query.businessProfiles.findFirst({
        where: eq(businessProfiles.organizationId, orgId),
      }),
      db.query.services.findMany({ where: eq(services.organizationId, orgId) }),
      db.query.availabilityRules.findMany({
        where: eq(availabilityRules.organizationId, orgId),
      }),
      db.query.availabilityExceptions.findMany({
        where: eq(availabilityExceptions.organizationId, orgId),
      }),
      db.query.bookings.findMany({ where: eq(bookings.organizationId, orgId) }),
      db.query.member.findFirst({ where: eq(member.organizationId, orgId) }),
      db.query.orgSubscriptions.findFirst({
        where: eq(orgSubscriptions.organizationId, orgId),
      }),
      db.query.orgPayoutAccounts.findFirst({
        where: eq(orgPayoutAccounts.organizationId, orgId),
      }),
    ]);
  return { org, profile, svc, rules, exceptions, rows, owner, sub, payout };
}

function expectPublished(
  state: Awaited<ReturnType<typeof stateOf>>,
  demo: (typeof DEMO_ACCOUNTS)[number]
) {
  expect(state.org?.name).toBe(demo.name);
  expect(state.org?.slug).toBe(demo.slug);
  expect(state.owner?.role).toBe("owner");
  expect(state.profile?.slotGranularityMinutes).toBe(30);
  expect(state.profile?.phone).toMatch(/^021[26] 000 00 00$/);
  expect(state.profile?.description).toMatch(/örnek işletmesi/);
  expect(state.svc.map((s) => s.name).sort()).toEqual([
    "Cilt Bakımı",
    "Manikür",
    "Saç Kesimi",
  ]);
  expect(state.rules).toHaveLength(12);
  expect(state.exceptions).toHaveLength(0);
  const now = Date.now();
  expect(state.rows.filter((b) => b.startsAt.getTime() < now).length).toBe(40);
  expect(state.rows.filter((b) => b.startsAt.getTime() >= now).length).toBe(14);
}

beforeAll(async () => {
  await cleanUp();
  // A real business beside the demos, to prove the reset never reaches it.
  await db.insert(organization).values({
    id: BYSTANDER,
    name: "Komşu Salon",
    slug: "itest-komsu-salon",
    createdAt: new Date(),
  });
  const [svc] = await db
    .insert(services)
    .values({
      organizationId: BYSTANDER,
      name: "Komşu hizmeti",
      durationMinutes: 30,
      priceCents: 100,
    })
    .returning({ id: services.id });
  await db.insert(bookings).values({
    organizationId: BYSTANDER,
    serviceId: svc.id,
    customerName: "Komşu müşteri",
    customerEmail: "komsu@test.dev",
    startsAt: new Date(Date.now() + 86_400_000),
    endsAt: new Date(Date.now() + 86_400_000 + 30 * 60_000),
    status: "confirmed",
  });
});

afterAll(async () => {
  await cleanUp();
  await db.$client.end();
});

describe("resetDemo", () => {
  it("builds both demo businesses from nothing", async () => {
    const summary = await resetDemo({ subMerchantKey: KEY });

    expect(summary[DEMO_PRO.slug]).toEqual({
      bookings: 54,
      slugRestored: true,
      collectsKapora: true,
    });
    for (const demo of DEMO_ACCOUNTS) {
      expectPublished(await stateOf(demo.orgId), demo);
    }
    const pro = await stateOf(DEMO_PRO.orgId);
    expect(pro.sub).toMatchObject({ plan: "pro", status: "active" });
    expect(pro.payout).toMatchObject({ status: "active", subMerchantKey: KEY });
    const free = await stateOf(DEMO_FREE.orgId);
    expect(free.sub).toBeUndefined();
    expect(free.payout).toBeUndefined();
  });

  it("puts back everything a visitor changed", async () => {
    // Rename and move it, rewrite the page, empty the week, close a day,
    // book a slot, cancel Pro, and start a trial on the free demo.
    await db
      .update(organization)
      .set({ name: "Ele geçirildi", slug: "ele-gecirildi" })
      .where(eq(organization.id, DEMO_PRO.orgId));
    await db
      .update(businessProfiles)
      .set({
        phone: "0555 555 55 55",
        description: null,
        slotGranularityMinutes: 5,
      })
      .where(eq(businessProfiles.organizationId, DEMO_PRO.orgId));
    await db
      .delete(availabilityRules)
      .where(eq(availabilityRules.organizationId, DEMO_PRO.orgId));
    await db.insert(availabilityExceptions).values({
      organizationId: DEMO_PRO.orgId,
      startsOn: "2099-01-01",
      endsOn: "2099-01-07",
    });
    const [anyService] = await db.query.services.findMany({
      where: eq(services.organizationId, DEMO_PRO.orgId),
    });
    await db.insert(bookings).values({
      organizationId: DEMO_PRO.orgId,
      serviceId: anyService.id,
      customerName: "Ziyaretçi",
      customerEmail: "ziyaretci@test.dev",
      startsAt: new Date("2099-02-01T09:00:00Z"),
      endsAt: new Date("2099-02-01T09:30:00Z"),
      status: "confirmed",
    });
    await db
      .update(orgSubscriptions)
      .set({ cancelAtPeriodEnd: true, status: "cancelled" })
      .where(eq(orgSubscriptions.organizationId, DEMO_PRO.orgId));
    await db.insert(orgSubscriptions).values({
      organizationId: DEMO_FREE.orgId,
      plan: "pro",
      status: "trialing",
      trialEndsAt: new Date(Date.now() + 14 * 86_400_000),
    });

    await resetDemo({ subMerchantKey: KEY });

    for (const demo of DEMO_ACCOUNTS) {
      expectPublished(await stateOf(demo.orgId), demo);
    }
    const pro = await stateOf(DEMO_PRO.orgId);
    expect(pro.sub).toMatchObject({
      plan: "pro",
      status: "active",
      cancelAtPeriodEnd: false,
    });
    expect(pro.rows.some((b) => b.customerName === "Ziyaretçi")).toBe(false);
    expect((await stateOf(DEMO_FREE.orgId)).sub).toBeUndefined();
  });

  it("gives the same result run twice", async () => {
    await resetDemo({ subMerchantKey: KEY });
    const first = await stateOf(DEMO_PRO.orgId);
    await resetDemo({ subMerchantKey: KEY });
    const second = await stateOf(DEMO_PRO.orgId);
    expect(second.rows).toHaveLength(first.rows.length);
    expect(second.svc).toHaveLength(first.svc.length);
    // One owner, one link — never a second member row.
    const members = await db.query.member.findMany({
      where: eq(member.organizationId, DEMO_PRO.orgId),
    });
    expect(members).toHaveLength(1);
  });

  it("keeps an existing submerchant when no key is configured", async () => {
    const summary = await resetDemo({ subMerchantKey: null });
    expect(summary[DEMO_PRO.slug].collectsKapora).toBe(true);
    expect((await stateOf(DEMO_PRO.orgId)).payout?.subMerchantKey).toBe(KEY);
  });

  it("never touches another business", async () => {
    const [org, svc, rows] = await Promise.all([
      db.query.organization.findFirst({
        where: eq(organization.id, BYSTANDER),
      }),
      db.query.services.findMany({
        where: eq(services.organizationId, BYSTANDER),
      }),
      db.query.bookings.findMany({
        where: and(
          eq(bookings.organizationId, BYSTANDER),
          like(bookings.customerName, "Komşu%")
        ),
      }),
    ]);
    expect(org?.name).toBe("Komşu Salon");
    expect(svc).toHaveLength(1);
    expect(rows).toHaveLength(1);
  });
});
