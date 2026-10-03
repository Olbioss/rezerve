/**
 * Fifty visitors press "Randevuyu onayla" on the same slot at the same
 * instant. Afterwards exactly one booking may exist, and the other forty-nine
 * must each have been told the slot is gone — not crashed, not throttled, and
 * not double-booked.
 *
 * Two things would make that easy to fake. The app's pool holds ten
 * connections, which would quietly run the fifty in waves of ten, so this
 * file hands the app a pool of sixty and records how many connections were
 * in use at once. And the booking form's throttle allows six attempts an
 * hour per address, so each visitor arrives from an address of its own.
 */
import { and, eq } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const shared = vi.hoisted(() => ({
  visitor: 0,
  pool: null as Pool | null,
  peakInUse: 0,
}));

vi.mock("@/lib/db", async () => {
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { Pool } = await import("pg");
  const schema = await import("@/lib/db/schema");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 60,
  });
  pool.on("acquire", () => {
    shared.peakInUse = Math.max(
      shared.peakInUse,
      pool.totalCount - pool.idleCount
    );
  });
  shared.pool = pool;
  return { db: drizzle({ client: pool, schema }) };
});
vi.mock("next/headers", () => ({
  headers: async () =>
    new Map([["x-forwarded-for", `198.51.100.${++shared.visitor}`]]),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectError(url);
  },
}));
vi.mock("@/lib/email/booking-notifications", () => ({
  sendBookingConfirmedEmails: vi.fn(),
  sendBookingCancelledEmails: vi.fn(),
}));

class RedirectError extends Error {
  constructor(public url: string) {
    super(`REDIRECT:${url}`);
  }
}

const { createBooking } = await import("./bookings");
const { db } = await import("@/lib/db");
const { organization } = await import("@/lib/db/schema/auth-schema");
const { services } = await import("@/lib/db/schema/service-schema");
const { availabilityRules } = await import(
  "@/lib/db/schema/availability-schema"
);
const { businessProfiles } = await import("@/lib/db/schema/business-schema");
const { bookingAttempts, bookings } = await import(
  "@/lib/db/schema/booking-schema"
);

const ORG_ID = "org_itest_booking_race";
const SLUG = "itest-booking-race";
const VISITORS = 50;
let serviceId: string;

// Tomorrow is always inside the booking window; 10:00 UTC is on its grid.
const tomorrow = new Date(Date.now() + 86_400_000);
const slot = new Date(tomorrow);
slot.setUTCHours(10, 0, 0, 0);

beforeAll(async () => {
  await db.delete(organization).where(eq(organization.id, ORG_ID));
  await db.insert(organization).values({
    id: ORG_ID,
    name: "Yarış Salonu",
    slug: SLUG,
    createdAt: new Date(),
  });
  await db.insert(businessProfiles).values({
    organizationId: ORG_ID,
    timezone: "UTC",
    minLeadTimeMinutes: 0,
  });
  const [service] = await db
    .insert(services)
    .values({
      organizationId: ORG_ID,
      name: "Saç Kesimi",
      durationMinutes: 30,
      priceCents: 5000,
    })
    .returning({ id: services.id });
  serviceId = service.id;
  await db.insert(availabilityRules).values({
    organizationId: ORG_ID,
    weekday: tomorrow.getUTCDay(),
    startMinutes: 9 * 60,
    endMinutes: 17 * 60,
  });
  await db
    .delete(bookingAttempts)
    .where(eq(bookingAttempts.organizationId, ORG_ID));
});

afterAll(async () => {
  // Cascades to the profile, the service, the hours and the bookings.
  await db.delete(organization).where(eq(organization.id, ORG_ID));
  await shared.pool?.end();
});

describe("createBooking under contention", () => {
  it("fifty simultaneous reservations for one slot: exactly one wins", async () => {
    const attempt = (n: number) =>
      createBooking({
        slug: SLUG,
        serviceId,
        startsAt: slot.toISOString(),
        customerName: `Ziyaretçi ${n}`,
        customerEmail: `ziyaretci${n}@test.dev`,
      }).then(
        (result) => ({ won: false as const, error: result?.error }),
        (err) => {
          // A booking that succeeds redirects to its confirmation; anything
          // else thrown is a crash, and rejects the whole race.
          if (err instanceof RedirectError) {
            return { won: true as const, url: err.url };
          }
          throw err;
        }
      );

    const outcomes = await Promise.all(
      Array.from({ length: VISITORS }, (_, i) => attempt(i + 1))
    );

    const winners = outcomes.filter((o) => o.won);
    const losers = outcomes.filter((o) => !o.won);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(VISITORS - 1);
    // Each loser was told the slot is gone: by the availability check if the
    // winner had already committed, by the exclusion constraint if not.
    for (const loser of losers) {
      expect(loser.error).toMatch(/az önce doldu|artık müsait değil/);
    }

    // The database agrees: one booking at that instant, and it is the one
    // the winner was sent to.
    const rows = await db
      .select({ id: bookings.id, status: bookings.status })
      .from(bookings)
      .where(
        and(eq(bookings.organizationId, ORG_ID), eq(bookings.startsAt, slot))
      );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("confirmed");
    expect(winners[0]?.won && winners[0].url).toBe(
      `/r/${SLUG}/onay/${rows[0].id}`
    );

    // And they really were simultaneous: more attempts were inside Postgres
    // at once than the app's own pool of ten could ever have let through.
    expect(shared.peakInUse).toBeGreaterThan(10);
    // It takes well under a second; the margin is for a slow CI runner.
  }, 30_000);
});
