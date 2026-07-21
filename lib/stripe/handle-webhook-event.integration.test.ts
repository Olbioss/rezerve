/**
 * Integration tests for the Stripe webhook handler against the local dev DB.
 * Email sends are mocked; state transitions and idempotency are real.
 */
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const sendConfirmed = vi.fn();
const sendCancelled = vi.fn();
vi.mock("@/lib/email/booking-notifications", () => ({
  sendBookingConfirmedEmails: (...args: unknown[]) => sendConfirmed(...args),
  sendBookingCancelledEmails: (...args: unknown[]) => sendCancelled(...args),
}));

const { handleWebhookEvent } = await import("./handle-webhook-event");
const { db } = await import("@/lib/db");
const { organization } = await import("@/lib/db/schema/auth-schema");
const { bookings } = await import("@/lib/db/schema/booking-schema");
const { businessProfiles } = await import("@/lib/db/schema/business-schema");
const { services } = await import("@/lib/db/schema/service-schema");

const ORG_ID = "org_itest_webhook";
let serviceId: string;
let bookingId: string;

function fakeEvent(
  type: "checkout.session.completed" | "checkout.session.expired",
  id: string | undefined
): Stripe.Event {
  return {
    type,
    data: { object: { metadata: id ? { bookingId: id } : {} } },
  } as unknown as Stripe.Event;
}

async function bookingStatus(): Promise<string | undefined> {
  const row = await db.query.bookings.findFirst({
    where: eq(bookings.id, bookingId),
  });
  return row?.status;
}

beforeAll(async () => {
  await db.delete(organization).where(eq(organization.id, ORG_ID));
  await db.insert(organization).values({
    id: ORG_ID,
    name: "Webhook Salon",
    slug: "itest-webhook",
    createdAt: new Date(),
  });
  await db
    .insert(businessProfiles)
    .values({ organizationId: ORG_ID, timezone: "UTC" });
  const [service] = await db
    .insert(services)
    .values({
      organizationId: ORG_ID,
      name: "Deposit Cut",
      durationMinutes: 30,
      priceCents: 5000,
      depositCents: 1000,
    })
    .returning({ id: services.id });
  serviceId = service.id;
});

beforeEach(async () => {
  sendConfirmed.mockClear();
  sendCancelled.mockClear();
  await db.delete(bookings).where(eq(bookings.organizationId, ORG_ID));
  const startsAt = new Date(Date.now() + 7 * 86_400_000);
  const [booking] = await db
    .insert(bookings)
    .values({
      organizationId: ORG_ID,
      serviceId,
      customerName: "Pending Pat",
      customerEmail: "pat@test.dev",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 30 * 60_000),
      status: "pending",
      depositCents: 1000,
      expiresAt: new Date(Date.now() + 30 * 60_000),
    })
    .returning({ id: bookings.id });
  bookingId = booking.id;
});

afterAll(async () => {
  await db.delete(organization).where(eq(organization.id, ORG_ID));
  await db.$client.end();
});

describe("handleWebhookEvent (integration)", () => {
  it("completed: confirms the pending booking and emails once", async () => {
    await handleWebhookEvent(
      fakeEvent("checkout.session.completed", bookingId)
    );
    expect(await bookingStatus()).toBe("confirmed");
    expect(sendConfirmed).toHaveBeenCalledTimes(1);
  });

  it("duplicate completed delivery: no second email, state unchanged", async () => {
    await handleWebhookEvent(
      fakeEvent("checkout.session.completed", bookingId)
    );
    await handleWebhookEvent(
      fakeEvent("checkout.session.completed", bookingId)
    );
    expect(await bookingStatus()).toBe("confirmed");
    expect(sendConfirmed).toHaveBeenCalledTimes(1);
  });

  it("expired: cancels the pending booking silently", async () => {
    await handleWebhookEvent(fakeEvent("checkout.session.expired", bookingId));
    expect(await bookingStatus()).toBe("cancelled");
    expect(sendCancelled).not.toHaveBeenCalled();
  });

  it("completed after expiry: does not resurrect a cancelled booking", async () => {
    await handleWebhookEvent(fakeEvent("checkout.session.expired", bookingId));
    await handleWebhookEvent(
      fakeEvent("checkout.session.completed", bookingId)
    );
    expect(await bookingStatus()).toBe("cancelled");
    expect(sendConfirmed).not.toHaveBeenCalled();
  });

  it("ignores events without a bookingId or with unknown ids", async () => {
    await handleWebhookEvent(
      fakeEvent("checkout.session.completed", undefined)
    );
    await handleWebhookEvent(
      fakeEvent(
        "checkout.session.completed",
        "00000000-0000-0000-0000-000000000000"
      )
    );
    expect(await bookingStatus()).toBe("pending");
    expect(sendConfirmed).not.toHaveBeenCalled();
  });
});
