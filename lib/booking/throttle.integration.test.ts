/**
 * The booking throttle, against a real database.
 *
 * What matters here is that the limits are per-organization and per-identity,
 * that a rejected attempt still counts (otherwise ignoring rejections buys
 * unlimited retries), and that a missing address does not put every anonymous
 * caller in one bucket.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { organization } from "@/lib/db/schema/auth-schema";
import { bookingAttempts } from "@/lib/db/schema/booking-schema";
import { checkBookingThrottle, THROTTLED_MESSAGE } from "./throttle";

const ORG = "org_itest_throttle";
const OTHER = "org_itest_throttle_other";
const IP = "203.0.113.9";

async function seedOrg(id: string) {
  await db.delete(organization).where(eq(organization.id, id));
  await db
    .insert(organization)
    .values({ id, name: id, slug: id, createdAt: new Date() });
}

const attempt = (
  overrides: Partial<Parameters<typeof checkBookingThrottle>[0]> = {}
) =>
  checkBookingThrottle({
    organizationId: ORG,
    ip: IP,
    email: "ayse@test.dev",
    ...overrides,
  });

beforeEach(async () => {
  await seedOrg(ORG);
  await seedOrg(OTHER);
});

afterAll(async () => {
  await db.delete(organization).where(eq(organization.id, ORG));
  await db.delete(organization).where(eq(organization.id, OTHER));
  await db.$client.end();
});

describe("checkBookingThrottle", () => {
  it("allows a normal run of attempts", async () => {
    expect(await attempt()).toBeNull();
    expect(await attempt()).toBeNull();
    expect(await attempt()).toBeNull();
  });

  it("rejects once one email goes past its limit", async () => {
    await attempt();
    await attempt();
    await attempt();

    expect(await attempt()).toBe(THROTTLED_MESSAGE);
  });

  it("keeps counting rejected attempts, so retrying does not reset it", async () => {
    for (let i = 0; i < 4; i += 1) await attempt();
    expect(await attempt()).toBe(THROTTLED_MESSAGE);
    expect(await attempt()).toBe(THROTTLED_MESSAGE);
  });

  it("rejects one address spraying different emails", async () => {
    // Under the per-email limit every time, so only the address catches it.
    for (let i = 0; i < 6; i += 1) {
      expect(await attempt({ email: `visitor${i}@test.dev` })).toBeNull();
    }
    expect(await attempt({ email: "visitor6@test.dev" })).toBe(
      THROTTLED_MESSAGE
    );
  });

  it("does not bucket callers together when the address is unknown", async () => {
    for (let i = 0; i < 8; i += 1) {
      expect(
        await attempt({ ip: null, email: `anon${i}@test.dev` })
      ).toBeNull();
    }
  });

  it("counts each organization separately", async () => {
    await attempt();
    await attempt();
    await attempt();
    expect(await attempt()).toBe(THROTTLED_MESSAGE);

    expect(await attempt({ organizationId: OTHER })).toBeNull();
  });

  it("ignores attempts older than the window, and prunes them", async () => {
    await db.insert(bookingAttempts).values(
      Array.from({ length: 5 }, () => ({
        organizationId: ORG,
        ip: IP,
        email: "ayse@test.dev",
        createdAt: new Date(Date.now() - 2 * 60 * 60_000),
      }))
    );

    expect(await attempt()).toBeNull();

    const left = await db
      .select({ id: bookingAttempts.id })
      .from(bookingAttempts)
      .where(eq(bookingAttempts.organizationId, ORG));
    expect(left).toHaveLength(1);
  });
});
