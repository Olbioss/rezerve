/**
 * The kapora's terms in the customer's confirmation, and in their email after
 * a move, as they stand when the email goes: the refund deadline while it is
 * still ahead, and no refund promised once the appointment is inside the day.
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

const { sendBookingConfirmedEmails, sendBookingRescheduledEmail } =
  await import("./booking-notifications");
const { db } = await import("@/lib/db");
const { organization } = await import("@/lib/db/schema/auth-schema");
const { bookings } = await import("@/lib/db/schema/booking-schema");
const { businessProfiles } = await import("@/lib/db/schema/business-schema");
const { services } = await import("@/lib/db/schema/service-schema");

const ORG = "org_itest_kapora_note";
const CUSTOMER = "ayse@test.dev";
const HOUR_MS = 3_600_000;
const NO_REFUND =
  "Randevuya 24 saatten az kaldığı için iptal ederseniz kapora işletmede kalır.";
let serviceId: string;

beforeAll(async () => {
  await db.delete(organization).where(eq(organization.id, ORG));
  await db.insert(organization).values({
    id: ORG,
    name: "ITest Salon",
    slug: "itest-kapora-note",
    createdAt: new Date(),
  });
  await db
    .insert(businessProfiles)
    .values({ organizationId: ORG, timezone: "UTC" });
  const [service] = await db
    .insert(services)
    .values({
      organizationId: ORG,
      name: "Saç Kesimi",
      durationMinutes: 60,
      priceCents: 80_000,
    })
    .returning({ id: services.id });
  serviceId = service.id;
});

beforeEach(() => {
  sent.mockReset();
});

afterAll(async () => {
  await db.delete(organization).where(eq(organization.id, ORG));
  await db.$client.end();
});

/** A confirmed booking starting `hoursAhead` from now. */
async function booking(
  hoursAhead: number,
  { depositCents = 30_000 }: { depositCents?: number | null } = {}
) {
  const startsAt = new Date(Date.now() + hoursAhead * HOUR_MS);
  const [row] = await db
    .insert(bookings)
    .values({
      organizationId: ORG,
      serviceId,
      customerName: "Ayşe Yılmaz",
      customerEmail: CUSTOMER,
      startsAt,
      endsAt: new Date(startsAt.getTime() + HOUR_MS),
      status: "confirmed",
      depositCents,
    })
    .returning();
  return row;
}

/** The note in the email the customer was sent. */
function customerNote(): string | undefined {
  const email = sent.mock.calls
    .map(
      ([props]) => props as { to: string; body: { props: { note?: string } } }
    )
    .find((props) => props.to === CUSTOMER);
  expect(email).toBeDefined();
  return email?.body.props.note;
}

describe("the kapora note in the customer's emails", () => {
  it("states the refund deadline when there is more than a day to go", async () => {
    await sendBookingConfirmedEmails(await booking(48));

    expect(customerNote()).toMatch(
      /^Randevudan 24 saat öncesine kadar \(.+\) iptal ederseniz kaporanız iade edilir;/
    );
  });

  it("promises no refund for a booking made inside the day", async () => {
    await sendBookingConfirmedEmails(await booking(3));

    expect(customerNote()).toBe(NO_REFUND);
  });

  it("promises no refund after a move to inside the day", async () => {
    const moved = await booking(5);

    await sendBookingRescheduledEmail(
      moved,
      new Date(Date.now() + 72 * HOUR_MS)
    );

    expect(customerNote()).toBe(NO_REFUND);
  });

  it("says nothing of a kapora when none was paid", async () => {
    await sendBookingConfirmedEmails(await booking(7, { depositCents: null }));

    expect(customerNote()).toBeUndefined();
  });
});
