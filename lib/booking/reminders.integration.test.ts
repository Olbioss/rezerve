/**
 * The day-before reminder run, against a real database.
 *
 * `now` is a fixed morning years ahead, so nothing another suite left behind
 * falls inside its tomorrow, and the email is a stand-in that records what
 * it was asked to send: what is under test is which bookings are chosen, and
 * that each is chosen once.
 */
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { organization } from "@/lib/db/schema/auth-schema";
import { orgSubscriptions } from "@/lib/db/schema/billing-schema";
import { bookings } from "@/lib/db/schema/booking-schema";
import { businessProfiles } from "@/lib/db/schema/business-schema";
import { services } from "@/lib/db/schema/service-schema";
import { type SendReminder, sendDayBeforeReminders } from "./reminders";

const PRO = "org_itest_reminders_pro";
const FREE = "org_itest_reminders_free";
const NEW_YORK = "org_itest_reminders_ny";
const ORGS = [PRO, FREE, NEW_YORK];

// Tuesday 10 June 2031, 06:00 UTC: the cron's 09:00 in Istanbul, 02:00 in
// New York. Istanbul's tomorrow is 10 June 21:00Z to 11 June 21:00Z.
const NOW = new Date("2031-06-10T06:00:00Z");
const DAY_MS = 86_400_000;

const serviceIds: Record<string, string> = {};

async function seedBusiness(id: string, timezone: string, pro: boolean) {
  await db.delete(organization).where(eq(organization.id, id));
  await db
    .insert(organization)
    .values({ id, name: id, slug: id, createdAt: new Date() });
  await db.insert(businessProfiles).values({ organizationId: id, timezone });
  if (pro) {
    await db.insert(orgSubscriptions).values({
      organizationId: id,
      plan: "pro",
      status: "active",
      currentPeriodEndsAt: new Date("2040-01-01T00:00:00Z"),
    });
  }
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

type Status = NonNullable<(typeof bookings.$inferInsert)["status"]>;

async function seedBooking(
  orgId: string,
  startsAt: string,
  {
    status = "confirmed",
    email = "ayse@test.dev",
    createdAt = new Date(NOW.getTime() - 2 * DAY_MS),
    reminderSentAt = null,
  }: {
    status?: Status;
    email?: string | null;
    createdAt?: Date;
    reminderSentAt?: Date | null;
  } = {}
): Promise<string> {
  const starts = new Date(startsAt);
  const [row] = await db
    .insert(bookings)
    .values({
      organizationId: orgId,
      serviceId: serviceIds[orgId],
      customerName: "Ayşe Yılmaz",
      customerEmail: email,
      startsAt: starts,
      endsAt: new Date(starts.getTime() + 45 * 60_000),
      status,
      createdAt,
      reminderSentAt,
    })
    .returning({ id: bookings.id });
  return row.id;
}

/** A stand-in email that records each booking it is handed. */
function recorder(result = true) {
  const sent: string[] = [];
  const send: SendReminder = async (booking) => {
    if (ORGS.includes(booking.organizationId)) sent.push(booking.id);
    return result;
  };
  return { sent, send };
}

const reminderSentAt = async (id: string) =>
  (await db.query.bookings.findFirst({ where: eq(bookings.id, id) }))
    ?.reminderSentAt ?? null;

beforeEach(async () => {
  await seedBusiness(PRO, "Europe/Istanbul", true);
  await seedBusiness(FREE, "Europe/Istanbul", false);
  await seedBusiness(NEW_YORK, "America/New_York", true);
});

afterAll(async () => {
  await db.delete(organization).where(inArray(organization.id, ORGS));
  await db.$client.end();
});

describe("sendDayBeforeReminders", () => {
  it("reminds tomorrow's confirmed bookings, and nothing else", async () => {
    const due = await seedBooking(PRO, "2031-06-11T07:00:00Z"); // 10:00 tomorrow
    const lastOfDay = await seedBooking(PRO, "2031-06-11T20:00:00Z"); // 23:00
    const others = [
      await seedBooking(PRO, "2031-06-11T08:00:00Z", { status: "pending" }),
      await seedBooking(PRO, "2031-06-11T09:00:00Z", { status: "cancelled" }),
      await seedBooking(PRO, "2031-06-11T10:00:00Z", { email: null }),
      await seedBooking(PRO, "2031-06-10T12:00:00Z"), // later today
      await seedBooking(PRO, "2031-06-11T21:30:00Z"), // 00:30 the day after
    ];
    const { sent, send } = recorder();

    const tally = await sendDayBeforeReminders(NOW, { send });

    expect(sent.sort()).toEqual([due, lastOfDay].sort());
    expect(tally).toMatchObject({ sent: 2, failed: 0 });
    expect(await reminderSentAt(due)).toEqual(NOW);
    for (const id of others) expect(await reminderSentAt(id)).toBeNull();
  });

  it("leaves a booking made in the last twelve hours to its confirmation", async () => {
    const fresh = await seedBooking(PRO, "2031-06-11T07:00:00Z", {
      createdAt: new Date(NOW.getTime() - 60 * 60_000),
    });
    const { sent, send } = recorder();

    await sendDayBeforeReminders(NOW, { send });

    expect(sent).toEqual([]);
    expect(await reminderSentAt(fresh)).toBeNull();
  });

  it("does not remind a free business's customers", async () => {
    const free = await seedBooking(FREE, "2031-06-11T07:00:00Z");
    const { sent, send } = recorder();

    await sendDayBeforeReminders(NOW, { send });

    expect(sent).toEqual([]);
    expect(await reminderSentAt(free)).toBeNull();
  });

  it("uses each business's own tomorrow", async () => {
    // 23:00 on 10 June in New York (today there) is already 06:00 on the
    // 11th in Istanbul; 10:00 on the 11th in New York is its tomorrow.
    const tonight = await seedBooking(NEW_YORK, "2031-06-11T03:00:00Z");
    const tomorrow = await seedBooking(NEW_YORK, "2031-06-11T14:00:00Z");
    const { sent, send } = recorder();

    await sendDayBeforeReminders(NOW, { send });

    expect(sent).toEqual([tomorrow]);
    expect(await reminderSentAt(tonight)).toBeNull();
  });

  it("sends nothing the second time, or for a booking already reminded", async () => {
    const due = await seedBooking(PRO, "2031-06-11T07:00:00Z");
    const earlier = new Date(NOW.getTime() - DAY_MS);
    const already = await seedBooking(PRO, "2031-06-11T12:00:00Z", {
      reminderSentAt: earlier,
    });
    const first = recorder();
    const second = recorder();

    await sendDayBeforeReminders(NOW, { send: first.send });
    await sendDayBeforeReminders(NOW, { send: second.send });

    expect(first.sent).toEqual([due]);
    expect(second.sent).toEqual([]);
    expect(await reminderSentAt(already)).toEqual(earlier);
  });

  it("reminds each booking once when two runs overlap", async () => {
    const a = await seedBooking(PRO, "2031-06-11T07:00:00Z");
    const b = await seedBooking(PRO, "2031-06-11T09:00:00Z");
    const c = await seedBooking(NEW_YORK, "2031-06-11T14:00:00Z");
    const one = recorder();
    const two = recorder();

    await Promise.all([
      sendDayBeforeReminders(NOW, { send: one.send }),
      sendDayBeforeReminders(NOW, { send: two.send }),
    ]);

    expect([...one.sent, ...two.sent].sort()).toEqual([a, b, c].sort());
  });

  it("releases a booking whose email did not go, so a later run can send it", async () => {
    const due = await seedBooking(PRO, "2031-06-11T07:00:00Z");
    const failing = recorder(false);

    const tally = await sendDayBeforeReminders(NOW, { send: failing.send });

    expect(failing.sent).toEqual([due]);
    expect(tally).toMatchObject({ sent: 0, failed: 1 });
    expect(await reminderSentAt(due)).toBeNull();

    const retry = recorder();
    await sendDayBeforeReminders(NOW, { send: retry.send });
    expect(retry.sent).toEqual([due]);
  });

  it("releases it too when sending throws", async () => {
    const due = await seedBooking(PRO, "2031-06-11T07:00:00Z");

    const tally = await sendDayBeforeReminders(NOW, {
      send: async () => {
        throw new Error("SMTP down");
      },
    });

    expect(tally.failed).toBeGreaterThanOrEqual(1);
    expect(await reminderSentAt(due)).toBeNull();
  });
});
