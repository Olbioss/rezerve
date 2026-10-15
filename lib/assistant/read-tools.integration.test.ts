/**
 * The assistant's read tools against a real database: what a business tells
 * a chat customer, which times it offers, and which bookings it shows them.
 * The business is in Istanbul, so every date and label is checked in its own
 * timezone rather than in UTC.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  getBusinessBySlug,
  localDateISO,
} from "@/lib/booking/get-available-slots";
import { localInstant } from "@/lib/booking/opening-hours";
import { db } from "@/lib/db";
import { organization } from "@/lib/db/schema/auth-schema";
import { availabilityRules } from "@/lib/db/schema/availability-schema";
import {
  orgPayoutAccounts,
  orgSubscriptions,
} from "@/lib/db/schema/billing-schema";
import { bookings } from "@/lib/db/schema/booking-schema";
import { businessProfiles } from "@/lib/db/schema/business-schema";
import { services } from "@/lib/db/schema/service-schema";
import type { AssistantIdentity } from "./identity";
import {
  findSlots,
  getBooking,
  getBusinessInfo,
  listMyBookings,
  listServices,
} from "./read-tools";

const TZ = "Europe/Istanbul";
const PRO = { id: "org_itest_read_tools_pro", slug: "itest-read-tools-pro" };
const FREE = { id: "org_itest_read_tools_free", slug: "itest-read-tools-free" };
const ALI = `telegram:${"a".repeat(26)}`;
const VELI = `telegram:${"b".repeat(26)}`;
const DAY = 86_400_000;
/** Business-local dates: find_slots looks at TOMORROW, bookings sit later. */
const localDay = (offset: number) =>
  localDateISO(new Date(Date.now() + offset * DAY), TZ);
const TOMORROW = localDay(1);
const DAY_AFTER = localDay(2);
const at = (dateISO: string, hour: number) =>
  localInstant(dateISO, hour * 60, TZ);

let ali: AssistantIdentity;
let aliAtTheFreeShop: AssistantIdentity;
let facial: string;
let aliConfirmed: string;
let aliLapsedHold: string;
let veliConfirmed: string;

async function seedOrg(org: { id: string; slug: string }) {
  await db.delete(organization).where(eq(organization.id, org.id));
  await db.insert(organization).values({
    id: org.id,
    name: org.id,
    slug: org.slug,
    createdAt: new Date(),
  });
  await db.insert(businessProfiles).values({
    organizationId: org.id,
    timezone: TZ,
    minLeadTimeMinutes: 0,
    phone: "0212 000 00 00",
    assistantEnabled: true,
    assistantNotes: "Otopark yok; en yakın otopark 100 metre ileride.",
  });
  // Open 09:00–12:00 every day: five hour-long starts on the 30-minute grid.
  await db.insert(availabilityRules).values(
    [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      organizationId: org.id,
      weekday,
      startMinutes: 9 * 60,
      endMinutes: 12 * 60,
    }))
  );
}

async function identityFor(slug: string, customerRef: string) {
  const business = await getBusinessBySlug(slug);
  if (!business) throw new Error(`seeded business ${slug} not found`);
  return { business, customerRef };
}

beforeAll(async () => {
  await seedOrg(PRO);
  await seedOrg(FREE);

  const rows = await db
    .insert(services)
    .values([
      {
        organizationId: PRO.id,
        name: "Cilt Bakımı",
        durationMinutes: 60,
        priceCents: 150_000,
        depositCents: 30_000,
      },
      {
        organizationId: PRO.id,
        name: "Manikür",
        durationMinutes: 30,
        priceCents: 50_000,
      },
      {
        organizationId: PRO.id,
        name: "Eski Hizmet",
        durationMinutes: 30,
        priceCents: 10_000,
        active: false,
      },
      {
        organizationId: FREE.id,
        name: "Cilt Bakımı",
        durationMinutes: 60,
        priceCents: 150_000,
        depositCents: 30_000,
      },
    ])
    .returning({ id: services.id });
  facial = rows[0].id;

  // Pro with an approved submerchant: its kapora is really collected.
  await db.insert(orgSubscriptions).values({
    organizationId: PRO.id,
    plan: "pro",
    status: "active",
    currentPeriodEndsAt: new Date(Date.now() + 30 * DAY),
    lastSyncedAt: new Date(),
  });
  await db.insert(orgPayoutAccounts).values({
    organizationId: PRO.id,
    status: "active",
    subMerchantKey: "sub_merchant_itest_read_tools",
    subMerchantExternalId: PRO.id,
    merchantType: "personal",
    name: "ITest Pro",
    contactName: "Ada",
    contactSurname: "Lovelace",
    identityNumber: "10000000146",
    iban: "TR180006200119000006672315",
    address: "Kadıköy/İstanbul",
    gsmNumber: "+905350000000",
    email: "pro@test.dev",
  });

  // DAY_AFTER: Ali's confirmed booking, a live hold, an expired hold and a
  // cancelled one; yesterday, a past one; three days out, Veli's.
  const booking = (values: Partial<typeof bookings.$inferInsert>) => ({
    organizationId: PRO.id,
    serviceId: facial,
    customerName: "Ali Yılmaz",
    source: "assistant" as const,
    customerRef: ALI,
    status: "confirmed" as const,
    startsAt: at(DAY_AFTER, 9),
    endsAt: at(DAY_AFTER, 10),
    ...values,
  });
  const inserted = await db
    .insert(bookings)
    .values([
      booking({}),
      booking({
        status: "pending",
        depositCents: 30_000,
        expiresAt: new Date(Date.now() + 20 * 60_000),
        startsAt: at(DAY_AFTER, 10),
        endsAt: at(DAY_AFTER, 11),
      }),
      booking({
        status: "pending",
        depositCents: 30_000,
        expiresAt: new Date(Date.now() - 5 * 60_000),
        startsAt: at(DAY_AFTER, 11),
        endsAt: at(DAY_AFTER, 12),
      }),
      booking({ status: "cancelled", cancelledAt: new Date() }),
      booking({ startsAt: at(localDay(-1), 9), endsAt: at(localDay(-1), 10) }),
      booking({
        customerName: "Veli Kaya",
        customerRef: VELI,
        startsAt: at(localDay(3), 9),
        endsAt: at(localDay(3), 10),
      }),
    ])
    .returning({ id: bookings.id });
  aliConfirmed = inserted[0].id;
  aliLapsedHold = inserted[2].id;
  veliConfirmed = inserted[5].id;

  ali = await identityFor(PRO.slug, ALI);
  aliAtTheFreeShop = await identityFor(FREE.slug, ALI);
});

afterAll(async () => {
  for (const org of [PRO, FREE]) {
    await db.delete(organization).where(eq(organization.id, org.id));
  }
  await db.$client.end();
});

function ok<T>(result: { ok: true; data: T } | { ok: false }): T {
  if (!result.ok)
    throw new Error(`expected data, got ${JSON.stringify(result)}`);
  return result.data;
}

describe("get_business_info", () => {
  it("dates 'today' in the business's timezone, even while UTC is still yesterday", async () => {
    // 00:30 in Istanbul is 21:30 the evening before in UTC.
    const info = ok(
      await getBusinessInfo(ali, new Date("2026-10-16T21:30:00Z"))
    );

    expect(info.today).toBe("2026-10-17");
    expect(info.now_local).toBe("2026-10-17T00:30");
    expect(info.timezone).toBe(TZ);
    expect(info.refund_notice_hours).toBe(24);
    expect(info.assistant_notes).toMatch(/Otopark/);
    expect(info.booking_page_url).toMatch(/\/r\/itest-read-tools-pro$/);
  });
});

describe("list_services", () => {
  it("lists only active services, with the kapora that will really be collected", async () => {
    const { services: listed } = ok(await listServices(ali));

    expect(listed.map((s) => s.name).sort()).toEqual([
      "Cilt Bakımı",
      "Manikür",
    ]);
    expect(listed.find((s) => s.name === "Cilt Bakımı")?.deposit_cents).toBe(
      30_000
    );
  });

  it("shows no kapora where the plan does not collect it", async () => {
    const { services: listed } = ok(await listServices(aliAtTheFreeShop));

    expect(listed[0].deposit_cents).toBeNull();
  });
});

describe("find_slots", () => {
  const find = (args: Record<string, unknown>) =>
    findSlots(ali, {
      service_id: facial,
      from_date: TOMORROW,
      to_date: TOMORROW,
      ...args,
    });
  const times = (result: Awaited<ReturnType<typeof find>>) =>
    ok(result).slots.map((s) => s.local_label.slice(-5));

  it("offers the day's free starts, labelled in the business's time", async () => {
    expect(times(await find({}))).toEqual([
      "09:00",
      "09:30",
      "10:00",
      "10:30",
      "11:00",
    ]);
  });

  it("keeps to the hours the customer asked about", async () => {
    expect(
      times(await find({ earliest_time: "10:00", latest_time: "10:30" }))
    ).toEqual(["10:00", "10:30"]);
  });

  it("stops at the limit and says there were more", async () => {
    const result = ok(await find({ to_date: DAY_AFTER, limit: 3 }));

    expect(result.slots).toHaveLength(3);
    expect(result.truncated).toBe(true);
  });

  it("leaves the customer's own booking out when looking for a time to move it to", async () => {
    // DAY_AFTER: Ali's booking 09:00–10:00, a live hold 10:00–11:00, and a
    // lapsed hold at 11:00 that no longer occupies anything.
    const sameDay = { from_date: DAY_AFTER, to_date: DAY_AFTER };
    expect(times(await find(sameDay))).toEqual(["11:00"]);
    expect(
      times(await find({ ...sameDay, rescheduling_booking_id: aliConfirmed }))
    ).toEqual(["09:00", "11:00"]);
  });

  it("will not leave out someone else's booking", async () => {
    expect(
      await find({ rescheduling_booking_id: veliConfirmed })
    ).toMatchObject({ ok: false, error: { code: "not_found" } });
  });

  it("refuses more than fourteen days, a range that ends before it starts, and an unknown service", async () => {
    expect(await find({ to_date: localDay(16) })).toMatchObject({
      ok: false,
      error: { code: "range_too_long" },
    });
    expect(await find({ from_date: DAY_AFTER })).toMatchObject({
      ok: false,
      error: { code: "invalid" },
    });
    expect(
      await find({ service_id: "00000000-0000-4000-8000-000000000000" })
    ).toMatchObject({ ok: false, error: { code: "not_found" } });
  });
});

describe("list_my_bookings", () => {
  it("shows this customer's upcoming bookings and live holds, and nobody else's", async () => {
    const { bookings: listed } = ok(await listMyBookings(ali));

    expect(listed.map((b) => [b.status, b.local_label.slice(-5)])).toEqual([
      ["confirmed", "09:00"],
      ["pending", "10:00"],
    ]);
    expect(listed[1].hold_expires_at).not.toBeNull();
    expect(listed.every((b) => b.service_id === facial)).toBe(true);
  });
});

describe("get_booking", () => {
  it("shows the customer's own booking", async () => {
    const booking = ok(await getBooking(ali, { booking_id: aliConfirmed }));

    expect(booking.service_name).toBe("Cilt Bakımı");
    expect(booking.service_id).toBe(facial);
    expect(booking.paid).toBe(false);
  });

  it("shows a hold whose kapora never came as released, as the slot lookup treats it", async () => {
    const hold = ok(await getBooking(ali, { booking_id: aliLapsedHold }));

    expect(hold.status).toBe("cancelled");
    expect(hold.hold_expires_at).toBeNull();
  });

  it("treats someone else's booking, or a cut-short id, as not there", async () => {
    expect(await getBooking(ali, { booking_id: veliConfirmed })).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
    expect(await getBooking(ali, { booking_id: "1234-kesik" })).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
  });
});
