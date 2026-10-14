/**
 * Who hears about a moved booking. When the owner moved it, only the
 * customer is told. When the customer moved it — through the chat assistant —
 * they get their own copy, in their own voice, and the owner is told the old
 * time is free, even when the customer left no email.
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

const { sent } = vi.hoisted(() => ({ sent: vi.fn() }));
vi.mock("@/lib/email/send", () => ({ sendEmailSafe: sent }));

const { sendBookingRescheduledEmail } = await import("./booking-notifications");
const { db } = await import("@/lib/db");
const { organization } = await import("@/lib/db/schema/auth-schema");
const { bookings } = await import("@/lib/db/schema/booking-schema");
const { businessProfiles } = await import("@/lib/db/schema/business-schema");
const { services } = await import("@/lib/db/schema/service-schema");

const ORG = "org_itest_reschedule_mail";
const NAME = "ITest Salon";
const OWNER = "sahip@salon.test";
const tomorrow = new Date(Date.now() + 86_400_000);
const at = (hourUTC: number) => {
  const d = new Date(tomorrow);
  d.setUTCHours(hourUTC, 0, 0, 0);
  return d;
};
let booking: typeof bookings.$inferSelect;

beforeAll(async () => {
  await db.delete(organization).where(eq(organization.id, ORG));
  await db.insert(organization).values({
    id: ORG,
    name: NAME,
    slug: "itest-reschedule-mail",
    createdAt: new Date(),
  });
  await db
    .insert(businessProfiles)
    .values({ organizationId: ORG, timezone: "UTC", contactEmail: OWNER });
  const [service] = await db
    .insert(services)
    .values({
      organizationId: ORG,
      name: "Saç Kesimi",
      durationMinutes: 60,
      priceCents: 80_000,
    })
    .returning({ id: services.id });
  [booking] = await db
    .insert(bookings)
    .values({
      organizationId: ORG,
      serviceId: service.id,
      customerName: "Ali Yılmaz",
      startsAt: at(10),
      endsAt: at(11),
      status: "confirmed",
      source: "assistant",
      customerRef: `telegram:${"a".repeat(26)}`,
    })
    .returning();
});

beforeEach(() => {
  sent.mockReset();
});

afterAll(async () => {
  await db.delete(organization).where(eq(organization.id, ORG));
  await db.$client.end();
});

const sends = () =>
  sent.mock.calls.map(([props]) => props as { to: string; subject: string });

describe("sendBookingRescheduledEmail", () => {
  it("tells the owner when a customer moves their booking, even without the customer's email", async () => {
    await sendBookingRescheduledEmail(booking, at(9), { by: "customer" });

    expect(sends().map((s) => s.to)).toEqual([OWNER]);
    expect(sends()[0].subject).toMatch(/^Müşteri randevusunu taşıdı/);
  });

  it("gives the customer their own copy, in their own voice", async () => {
    await sendBookingRescheduledEmail(
      { ...booking, customerEmail: "ali@test.dev" },
      at(9),
      { by: "customer" }
    );

    expect(
      sends()
        .map((s) => s.to)
        .sort()
    ).toEqual(["ali@test.dev", OWNER]);
    expect(sends().map((s) => s.subject)).toContain(
      `Randevunuzu taşıdınız — Saç Kesimi, ${NAME}`
    );
  });

  it("tells only the customer when the owner moved it", async () => {
    await sendBookingRescheduledEmail(
      { ...booking, customerEmail: "ali@test.dev" },
      at(9)
    );

    expect(sends().map((s) => s.to)).toEqual(["ali@test.dev"]);
    expect(sends()[0].subject).toMatch(/^Randevunuzun saati değişti/);
  });
});
