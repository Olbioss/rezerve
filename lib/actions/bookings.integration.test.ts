/**
 * Integration tests for createBooking against the local dev database.
 * Requires DATABASE_URL (loaded from .env) and applied migrations.
 */
import { eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => new Map([["x-forwarded-for", "203.0.113.9"]]),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectError(url);
  },
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
const { bookingAttempts } = await import("@/lib/db/schema/booking-schema");

const ORG_ID = "org_itest_bookings";
const SLUG = "itest-bookings";
let serviceId: string;

// Tomorrow is always inside the booking window; pick its weekday dynamically.
const tomorrow = new Date(Date.now() + 86_400_000);

beforeAll(async () => {
  await db.delete(organization).where(eq(organization.id, ORG_ID));
  await db.insert(organization).values({
    id: ORG_ID,
    name: "ITest Salon",
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
      name: "Test Cut",
      durationMinutes: 30,
      priceCents: 5000,
    })
    .returning({ id: services.id });
  serviceId = service.id;
  // Open 09:00–17:00 UTC on tomorrow's weekday.
  await db.insert(availabilityRules).values({
    organizationId: ORG_ID,
    weekday: tomorrow.getUTCDay(),
    startMinutes: 9 * 60,
    endMinutes: 17 * 60,
  });
});

beforeEach(async () => {
  await db
    .delete(bookingAttempts)
    .where(eq(bookingAttempts.organizationId, ORG_ID));
});

afterAll(async () => {
  // Cascades to profile, services, rules, bookings.
  await db.delete(organization).where(eq(organization.id, ORG_ID));
  await db.$client.end();
});

function slotAt(hourUTC: number): string {
  const d = new Date(tomorrow);
  d.setUTCHours(hourUTC, 0, 0, 0);
  return d.toISOString();
}

describe("createBooking (integration)", () => {
  it("books a free slot and redirects to the confirmation page", async () => {
    await expect(
      createBooking({
        slug: SLUG,
        serviceId,
        startsAt: slotAt(9),
        customerName: "Alice",
        customerEmail: "alice@test.dev",
      })
    ).rejects.toThrow(/REDIRECT:\/r\/itest-bookings\/onay\//);
  });

  it("rejects a slot that is already booked", async () => {
    const result = await createBooking({
      slug: SLUG,
      serviceId,
      startsAt: slotAt(9),
      customerName: "Bob",
      customerEmail: "bob@test.dev",
    });
    expect(result?.error).toMatch(/artık müsait değil/);
  });

  it("rejects an instant that is not on the slot grid", async () => {
    const offGrid = new Date(tomorrow);
    offGrid.setUTCHours(10, 7, 0, 0);
    const result = await createBooking({
      slug: SLUG,
      serviceId,
      startsAt: offGrid.toISOString(),
      customerName: "Mallory",
      customerEmail: "mallory@test.dev",
    });
    expect(result?.error).toMatch(/artık müsait değil/);
  });

  it("parallel double-submit: exactly one wins", async () => {
    const attempt = (name: string) =>
      createBooking({
        slug: SLUG,
        serviceId,
        startsAt: slotAt(11),
        customerName: name,
        customerEmail: `${name}@test.dev`,
      }).then(
        (result) => ({ ok: false as const, result }),
        (err) => ({ ok: true as const, err })
      );

    const [a, b] = await Promise.all([attempt("racer1"), attempt("racer2")]);
    const winners = [a, b].filter((r) => r.ok);
    const losers = [a, b].filter((r) => !r.ok);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    const loser = losers[0] as { ok: false; result: { error?: string } };
    expect(loser.result?.error).toMatch(/az önce doldu|artık müsait değil/);
  });

  it("unknown business slug errors cleanly", async () => {
    const result = await createBooking({
      slug: "no-such-business",
      serviceId,
      startsAt: slotAt(12),
      customerName: "Nobody",
      customerEmail: "nobody@test.dev",
    });
    expect(result?.error).toBe("İşletme bulunamadı");
  });
});
