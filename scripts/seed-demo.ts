/**
 * Seed the public demo business shown from the landing page (/b/demo).
 * Idempotent: safe to run repeatedly against dev or production —
 * existing demo data is left untouched (only missing pieces are created).
 *
 *   bun run seed:demo
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organization } from "@/lib/db/schema/auth-schema";
import { availabilityRules } from "@/lib/db/schema/availability-schema";
import { businessProfiles } from "@/lib/db/schema/business-schema";
import { services } from "@/lib/db/schema/service-schema";

const DEMO_ORG_ID = "org_slotly_demo";
const DEMO_SLUG = "demo";

async function main() {
  const existing = await db.query.organization.findFirst({
    where: eq(organization.slug, DEMO_SLUG),
  });

  if (!existing) {
    await db.insert(organization).values({
      id: DEMO_ORG_ID,
      name: "Slotly Demo Salon",
      slug: DEMO_SLUG,
      createdAt: new Date(),
    });
    console.log("✓ organization created");
  } else {
    console.log("• organization already exists");
  }
  const orgId = existing?.id ?? DEMO_ORG_ID;

  await db
    .insert(businessProfiles)
    .values({
      organizationId: orgId,
      timezone: "Europe/Istanbul",
      currency: "try",
      slotGranularityMinutes: 30,
      minLeadTimeMinutes: 60,
      bookingWindowDays: 30,
    })
    .onConflictDoNothing({ target: businessProfiles.organizationId });

  const existingServices = await db.query.services.findMany({
    where: eq(services.organizationId, orgId),
  });
  if (existingServices.length === 0) {
    await db.insert(services).values([
      {
        organizationId: orgId,
        name: "Saç Kesimi",
        description: "Yıkama ve fön dahil",
        durationMinutes: 45,
        priceCents: 80_000,
      },
      {
        organizationId: orgId,
        name: "Cilt Bakımı",
        description: "Derinlemesine temizlik ve maske",
        durationMinutes: 60,
        priceCents: 150_000,
        depositCents: 30_000,
      },
      {
        organizationId: orgId,
        name: "Manikür",
        durationMinutes: 30,
        priceCents: 50_000,
      },
    ]);
    console.log("✓ services created");
  } else {
    console.log("• services already exist");
  }

  const existingRules = await db.query.availabilityRules.findMany({
    where: eq(availabilityRules.organizationId, orgId),
  });
  if (existingRules.length === 0) {
    // Mon–Sat, 10:00–13:00 and 14:00–19:00 (lunch break shows split shifts).
    const weekdays = [1, 2, 3, 4, 5, 6];
    await db.insert(availabilityRules).values(
      weekdays.flatMap((weekday) => [
        {
          organizationId: orgId,
          weekday,
          startMinutes: 10 * 60,
          endMinutes: 13 * 60,
        },
        {
          organizationId: orgId,
          weekday,
          startMinutes: 14 * 60,
          endMinutes: 19 * 60,
        },
      ])
    );
    console.log("✓ availability created (Pzt–Cmt 10:00–13:00, 14:00–19:00)");
  } else {
    console.log("• availability already exists");
  }

  console.log(`Demo hazır: /b/${DEMO_SLUG}`);
  await db.$client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
