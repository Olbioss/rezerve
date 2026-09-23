/**
 * The bookings list query, against a real database.
 *
 * The hard .limit(100) it replaces was silently lossy: a business with more
 * history than that simply never saw the rest, and there was no way to look
 * for one customer. So what matters here is that paging reaches every row
 * exactly once, that the counts agree with what the pages contain, and that
 * neither ever reaches another business's bookings.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { organization } from "@/lib/db/schema/auth-schema";
import { bookings } from "@/lib/db/schema/booking-schema";
import { services } from "@/lib/db/schema/service-schema";
import { countBookings, loadBookings, PAGE_SIZE } from "./bookings-query";

const ORG = "org_itest_bookingq";
const OTHER = "org_itest_bookingq_other";
const NOW = new Date("2026-06-15T12:00:00.000Z");

const UPCOMING = 30; // more than one page, deliberately
const PAST = 5;

let serviceId: string;
let otherServiceId: string;

async function seedOrg(id: string, serviceName: string) {
  await db.delete(organization).where(eq(organization.id, id));
  await db
    .insert(organization)
    .values({ id, name: id, slug: id, createdAt: new Date() });
  const [service] = await db
    .insert(services)
    .values({
      organizationId: id,
      name: serviceName,
      durationMinutes: 30,
      priceCents: 50_000,
    })
    .returning({ id: services.id });
  return service.id;
}

/** Hourly slots, so bookings_no_overlap never trips. */
function slot(offsetHours: number) {
  const startsAt = new Date(NOW.getTime() + offsetHours * 3_600_000);
  return { startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60_000) };
}

beforeAll(async () => {
  serviceId = await seedOrg(ORG, "Saç Kesimi");
  otherServiceId = await seedOrg(OTHER, "Cilt Bakımı");

  await db.insert(bookings).values([
    ...Array.from({ length: UPCOMING }, (_, i) => ({
      organizationId: ORG,
      serviceId,
      customerName: `Müşteri ${String(i).padStart(2, "0")}`,
      customerEmail: `musteri${i}@test.dev`,
      customerPhone: i === 3 ? "0532 111 22 33" : null,
      ...slot(i + 1),
      status: "confirmed" as const,
    })),
    ...Array.from({ length: PAST }, (_, i) => ({
      organizationId: ORG,
      serviceId,
      customerName: `Eski ${i}`,
      customerEmail: `eski${i}@test.dev`,
      ...slot(-(i + 1)),
      status: "confirmed" as const,
    })),
    {
      organizationId: OTHER,
      serviceId: otherServiceId,
      customerName: "Müşteri 00",
      customerEmail: "musteri0@test.dev",
      ...slot(1),
      status: "confirmed" as const,
    },
  ]);
});

afterAll(async () => {
  for (const id of [ORG, OTHER]) {
    await db.delete(organization).where(eq(organization.id, id));
  }
  await db.$client.end();
});

const page = (n: number, q = "") => loadBookings(ORG, "upcoming", q, n, NOW);

describe("counts", () => {
  it("splits upcoming from past at the given instant", async () => {
    expect(await countBookings(ORG, "upcoming", "", NOW)).toBe(UPCOMING);
    expect(await countBookings(ORG, "past", "", NOW)).toBe(PAST);
  });

  it("counts only the caller's own business", async () => {
    expect(await countBookings(OTHER, "upcoming", "", NOW)).toBe(1);
  });

  it("narrows with the search term", async () => {
    expect(await countBookings(ORG, "upcoming", "musteri1@test.dev", NOW)).toBe(
      1
    );
  });
});

describe("paging", () => {
  it("fills a page and reaches the remainder on the next", async () => {
    const first = await page(1);
    const second = await page(2);

    expect(first).toHaveLength(PAGE_SIZE);
    expect(second).toHaveLength(UPCOMING - PAGE_SIZE);
  });

  it("reaches every row exactly once across pages", async () => {
    const seen = [...(await page(1)), ...(await page(2))].map((r) => r.id);

    expect(new Set(seen).size).toBe(UPCOMING);
  });

  it("returns nothing past the end rather than wrapping", async () => {
    expect(await page(99)).toHaveLength(0);
  });

  it("orders upcoming soonest-first and past most-recent-first", async () => {
    const upcoming = await page(1);
    const sorted = [...upcoming].sort((a, b) =>
      a.startsAtISO.localeCompare(b.startsAtISO)
    );
    expect(upcoming.map((r) => r.id)).toEqual(sorted.map((r) => r.id));

    const past = await loadBookings(ORG, "past", "", 1, NOW);
    const desc = [...past].sort((a, b) =>
      b.startsAtISO.localeCompare(a.startsAtISO)
    );
    expect(past.map((r) => r.id)).toEqual(desc.map((r) => r.id));
  });
});

describe("search", () => {
  it("matches a customer name, case-insensitively", async () => {
    const rows = await page(1, "müşteri 07");
    expect(rows).toHaveLength(1);
    expect(rows[0].customerName).toBe("Müşteri 07");
  });

  it("matches an email", async () => {
    const rows = await page(1, "musteri12@test.dev");
    expect(rows).toHaveLength(1);
  });

  it("matches a phone number, and returns it with the row", async () => {
    // An owner looking up the regular who just called.
    const rows = await page(1, "111 22 33");
    expect(rows).toHaveLength(1);
    expect(rows[0].customerPhone).toBe("0532 111 22 33");
  });

  it("matches a service name, which lives on the joined table", async () => {
    expect(await page(1, "saç")).toHaveLength(PAGE_SIZE);
    expect(await page(1, "cilt")).toHaveLength(0);
  });

  it("never reaches another business, even on an exact match", async () => {
    // OTHER has a booking with this exact name and email.
    const rows = await page(1, "musteri0@test.dev");
    expect(rows.every((r) => r.customerEmail === "musteri0@test.dev")).toBe(
      true
    );
    expect(rows).toHaveLength(1);
  });
});
