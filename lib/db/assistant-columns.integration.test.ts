/**
 * The columns the chat assistant relies on, and the two rules the database
 * keeps for it whatever the application does: an assistant booking always
 * names its customer, and a throttle row always names someone.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { pgErrorCode } from "@/lib/db/errors";
import { organization } from "@/lib/db/schema/auth-schema";
import { bookingAttempts, bookings } from "@/lib/db/schema/booking-schema";
import { businessProfiles } from "@/lib/db/schema/business-schema";
import { services } from "@/lib/db/schema/service-schema";

const ORG = "org_itest_assistant_columns";
const CHECK_VIOLATION = "23514";
const ALI = `telegram:${"a".repeat(26)}`;
const HOUR = 3_600_000;
let serviceId: string;

beforeAll(async () => {
  await db.delete(organization).where(eq(organization.id, ORG));
  await db.insert(organization).values({
    id: ORG,
    name: ORG,
    slug: "itest-assistant-columns",
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
      durationMinutes: 30,
      priceCents: 80_000,
    })
    .returning({ id: services.id });
  serviceId = service.id;
});

afterAll(async () => {
  await db.delete(organization).where(eq(organization.id, ORG));
  await db.$client.end();
});

let n = 0;
/** Each booking an hour after the last, so the overlap constraint stays out. */
function booking(values: Partial<typeof bookings.$inferInsert> = {}) {
  n += 1;
  const startsAt = new Date(Date.now() + (24 + n) * HOUR);
  return db
    .insert(bookings)
    .values({
      organizationId: ORG,
      serviceId,
      customerName: "Ali Yılmaz",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 30 * 60_000),
      ...values,
    })
    .returning();
}

async function violation(write: Promise<unknown>) {
  try {
    await write;
    return undefined;
  } catch (err) {
    return pgErrorCode(err);
  }
}

describe("the assistant's columns", () => {
  it("records a booking as the public form's unless told otherwise", async () => {
    const [row] = await booking({ customerEmail: "ali@test.dev" });
    expect(row.source).toBe("web");
    expect(row.customerRef).toBeNull();
  });

  it("keeps an assistant booking's customer", async () => {
    const [row] = await booking({ source: "assistant", customerRef: ALI });
    expect(row.source).toBe("assistant");
    expect(row.customerRef).toBe(ALI);
  });

  it("refuses an assistant booking that names no customer", async () => {
    expect(await violation(booking({ source: "assistant" }))).toBe(
      CHECK_VIOLATION
    );
  });

  it("refuses a throttle row that names nobody", async () => {
    expect(
      await violation(
        db
          .insert(bookingAttempts)
          .values({ organizationId: ORG, ip: "203.0.113.9" })
      )
    ).toBe(CHECK_VIOLATION);
  });

  it("starts every business with the assistant switched off", async () => {
    const profile = await db.query.businessProfiles.findFirst({
      where: eq(businessProfiles.organizationId, ORG),
    });
    expect(profile?.assistantEnabled).toBe(false);
    expect(profile?.assistantNotes).toBeNull();
  });
});
