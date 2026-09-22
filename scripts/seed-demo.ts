/**
 * Seed the public demo businesses shown from the landing page.
 *
 * Two of them, on purpose:
 *   /r/demo           — Pro, with an approved payout account: kapora is collected
 *   /r/demo-ucretsiz  — free plan, same service config: kapora is stored but NOT
 *                       collected, which is the only way to *see* the downgrade
 *                       rule rather than read about it
 *
 * Each gets an owner that can actually sign in, with published credentials
 * (lib/demo/credentials.ts) — without a `member` row requireOwner() resolves
 * no business, and the whole panel is unreachable.
 *
 * Idempotent: safe to run repeatedly — existing demo data is left untouched
 * and only missing pieces are created. The one exception is the owner
 * password, which is reset every run so a visitor cannot lock the demo out.
 *
 *   bun run seed:demo
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organization } from "@/lib/db/schema/auth-schema";
import { availabilityRules } from "@/lib/db/schema/availability-schema";
import {
  orgPayoutAccounts,
  orgSubscriptions,
} from "@/lib/db/schema/billing-schema";
import { businessProfiles } from "@/lib/db/schema/business-schema";
import { services } from "@/lib/db/schema/service-schema";
import {
  type DemoAccount,
  DEMO_FREE,
  DEMO_PRO,
} from "@/lib/demo/credentials";
import { ensureDemoOwner } from "@/lib/demo/seed-owner";

async function seedBusiness(demo: DemoAccount) {
  const existing = await db.query.organization.findFirst({
    where: eq(organization.slug, demo.slug),
  });
  if (!existing) {
    await db.insert(organization).values({
      id: demo.orgId,
      name: demo.name,
      slug: demo.slug,
      createdAt: new Date(),
    });
    console.log(`✓ ${demo.slug}: organization created`);
  } else {
    console.log(`• ${demo.slug}: organization already exists`);
  }
  const orgId = existing?.id ?? demo.orgId;

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
    // Identical on both businesses — the plan is the only difference.
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
    console.log(`✓ ${demo.slug}: services created`);
  }

  const existingRules = await db.query.availabilityRules.findMany({
    where: eq(availabilityRules.organizationId, orgId),
  });
  if (existingRules.length === 0) {
    // Mon–Sat, 10:00–13:00 and 14:00–19:00 (lunch break shows split shifts).
    await db.insert(availabilityRules).values(
      [1, 2, 3, 4, 5, 6].flatMap((weekday) => [
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
    console.log(`✓ ${demo.slug}: availability created`);
  }
  return orgId;
}

/**
 * The demo must not silently downgrade itself, so the period end is a year
 * out. reconcileIfStale only polls once that has passed, so the synthetic
 * reference code is never sent to the provider.
 */
async function seedProBilling(orgId: string) {
  // Every payment is a real iyzico call, so the demo needs a real
  // submerchant: `bun run demo:submerchant` creates one and prints its key.
  const subMerchantKey = process.env.DEMO_SUBMERCHANT_KEY;
  if (!subMerchantKey) {
    console.warn(
      "\n! DEMO_SUBMERCHANT_KEY is unset — the demo business cannot collect kapora."
    );
    console.warn(
      "  Run `bun run demo:submerchant` and put the printed key in .env, then re-run this.\n"
    );
    return;
  }

  await db
    .insert(orgSubscriptions)
    .values({
      organizationId: orgId,
      plan: "pro",
      status: "active",
      currentPeriodEndsAt: new Date(Date.now() + 365 * 86_400_000),
      // No card on file: the demo subscription is seeded, not purchased, so
      // leave nextChargeAt null rather than have the cron try to charge a
      // card that does not exist.
      nextChargeAt: null,
      lastSyncedAt: new Date(),
    })
    // Authoritative for the demo: an older run may have left values that no
    // longer work, and there is no real owner whose edits could be lost.
    .onConflictDoUpdate({
      target: orgSubscriptions.organizationId,
      set: {
        plan: "pro",
        status: "active",
        currentPeriodEndsAt: new Date(Date.now() + 365 * 86_400_000),
        nextChargeAt: null,
        cardUserKey: null,
        cardToken: null,
      },
    });

  await db
    .insert(orgPayoutAccounts)
    .values({
      organizationId: orgId,
      status: "active",
      subMerchantKey,
      subMerchantExternalId: orgId,
      merchantType: "personal",
      name: DEMO_PRO.name,
      contactName: "Demo",
      contactSurname: "Salon",
      identityNumber: "10000000146",
      iban: "TR180006200119000006672315",
      address: "Merdivenköy Mah. Bora Sok. No:1, Kadıköy/İstanbul",
      gsmNumber: "+905350000000",
      email: DEMO_PRO.email,
    })
    .onConflictDoUpdate({
      target: orgPayoutAccounts.organizationId,
      set: { status: "active", subMerchantKey },
    });

  console.log("✓ demo: Pro subscription + payout account");
}

async function main() {
  const proOrgId = await seedBusiness(DEMO_PRO);
  await ensureDemoOwner(DEMO_PRO);
  await seedProBilling(proOrgId);

  await seedBusiness(DEMO_FREE);
  await ensureDemoOwner(DEMO_FREE);

  console.log(
    `\nPro demo:      /r/${DEMO_PRO.slug}        (kapora tahsil edilir)`
  );
  console.log(
    `Ücretsiz demo: /r/${DEMO_FREE.slug} (kapora saklı ama tahsil edilmez)`
  );
  console.log("\nPanel logins:");
  for (const demo of [DEMO_PRO, DEMO_FREE]) {
    console.log(`  ${demo.email}  /  ${demo.password}`);
  }
  await db.$client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
