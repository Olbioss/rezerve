/**
 * The hold sweep, against a real database.
 *
 * The point of the global variant is the case the lazy one cannot reach: a
 * lapsed hold in an organization nobody is currently booking. createBooking
 * sweeps only the organization it is working on, so on a quiet business the
 * dead hold sits there holding its slot against the exclusion constraint
 * until somebody else happens to try. Nothing here calls createBooking.
 */
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { organization } from "@/lib/db/schema/auth-schema";
import { bookings } from "@/lib/db/schema/booking-schema";
import { services } from "@/lib/db/schema/service-schema";
import { expireAllHolds, expireHoldsForOrg } from "./expire-holds";

const QUIET = "org_itest_holds_quiet";
const BUSY = "org_itest_holds_busy";

const serviceIds: Record<string, string> = {};

async function seedOrg(id: string) {
  await db.delete(organization).where(eq(organization.id, id));
  await db
    .insert(organization)
    .values({ id, name: id, slug: id, createdAt: new Date() });
  const [service] = await db
    .insert(services)
    .values({
      organizationId: id,
      name: "Saç Kesimi",
      durationMinutes: 45,
      priceCents: 80_000,
    })
    .returning({ id: services.id });
  serviceIds[id] = service.id;
}

let slot = 0;

type SeedStatus = NonNullable<(typeof bookings.$inferInsert)["status"]>;

/** `expiresAt` in the past means the 30-minute hold has already lapsed. */
async function seedHold(
  orgId: string,
  opts: { expiresInMinutes: number; status?: SeedStatus } = {
    expiresInMinutes: -5,
  }
) {
  const { expiresInMinutes, status = "pending" } = opts;
  slot += 1;
  const startsAt = new Date(Date.now() + (7 * 24 + slot) * 3_600_000);
  const [row] = await db
    .insert(bookings)
    .values({
      organizationId: orgId,
      serviceId: serviceIds[orgId],
      customerName: "Ayşe Yılmaz",
      customerEmail: "ayse@test.dev",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 45 * 60_000),
      status,
      expiresAt:
        status === "pending"
          ? new Date(Date.now() + expiresInMinutes * 60_000)
          : null,
    })
    .returning({ id: bookings.id });
  return row.id;
}

const statusOf = async (id: string) =>
  (await db.query.bookings.findFirst({ where: eq(bookings.id, id) }))?.status;

beforeEach(async () => {
  await seedOrg(QUIET);
  await seedOrg(BUSY);
  slot = 0;
});

afterAll(async () => {
  await db.delete(organization).where(eq(organization.id, QUIET));
  await db.delete(organization).where(eq(organization.id, BUSY));
  await db.$client.end();
});

describe("expireAllHolds — the daily sweep", () => {
  it("releases a lapsed hold in an organization nobody is booking", async () => {
    const stale = await seedHold(QUIET, { expiresInMinutes: -5 });

    const released = await expireAllHolds();

    expect(released).toBeGreaterThanOrEqual(1);
    expect(await statusOf(stale)).toBe("cancelled");
  });

  it("leaves a hold that has not run out yet", async () => {
    const live = await seedHold(QUIET, { expiresInMinutes: 20 });

    await expireAllHolds();

    expect(await statusOf(live)).toBe("pending");
  });

  it("does not touch confirmed bookings", async () => {
    const confirmed = await seedHold(QUIET, {
      expiresInMinutes: -5,
      status: "confirmed",
    });

    await expireAllHolds();

    expect(await statusOf(confirmed)).toBe("confirmed");
  });

  it("reaches every organization in one run", async () => {
    const a = await seedHold(QUIET, { expiresInMinutes: -5 });
    const b = await seedHold(BUSY, { expiresInMinutes: -5 });

    await expireAllHolds();

    expect(await statusOf(a)).toBe("cancelled");
    expect(await statusOf(b)).toBe("cancelled");
  });

  it("stamps cancelledAt so the release is auditable", async () => {
    const stale = await seedHold(QUIET, { expiresInMinutes: -5 });

    await expireAllHolds();

    const row = await db.query.bookings.findFirst({
      where: eq(bookings.id, stale),
    });
    expect(row?.cancelledAt).toBeInstanceOf(Date);
  });
});

describe("expireHoldsForOrg — the lazy path", () => {
  it("sweeps its own organization and leaves the other alone", async () => {
    const mine = await seedHold(QUIET, { expiresInMinutes: -5 });
    const theirs = await seedHold(BUSY, { expiresInMinutes: -5 });

    const released = await expireHoldsForOrg(QUIET);

    expect(released).toBe(1);
    expect(await statusOf(mine)).toBe("cancelled");
    expect(await statusOf(theirs)).toBe("pending");
  });

  it("counts only what it actually released", async () => {
    await seedHold(QUIET, { expiresInMinutes: -5 });
    await seedHold(QUIET, { expiresInMinutes: 20 });

    expect(await expireHoldsForOrg(QUIET)).toBe(1);

    const live = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(
        and(eq(bookings.organizationId, QUIET), eq(bookings.status, "pending"))
      );
    expect(live).toHaveLength(1);
  });
});
