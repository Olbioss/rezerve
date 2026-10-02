/**
 * Put both demo businesses back exactly as published.
 *
 * The demo logins are public, so every visitor can rename the business, move
 * its address, delete its services, close its week, change the owner's
 * password or start a trial on the free plan — and the next reviewer would
 * find whatever the last visitor left. This is a declarative reset rather than
 * another additive run: it does not ask what is missing, it replaces the lot.
 *
 * Runs nightly from the daily cron (app/api/cron/abonelik) and on demand from
 * `bun run seed:demo`. Demo bookings are deleted outright, never refunded: a
 * visitor's kapora was a sandbox payment. Nothing outside the two demo
 * organizations is touched — every write is scoped to their fixed ids.
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { pgErrorCode, UNIQUE_VIOLATION } from "@/lib/db/errors";
import { organization } from "@/lib/db/schema/auth-schema";
import {
  availabilityExceptions,
  availabilityRules,
} from "@/lib/db/schema/availability-schema";
import {
  orgPayoutAccounts,
  orgSubscriptions,
} from "@/lib/db/schema/billing-schema";
import { bookings } from "@/lib/db/schema/booking-schema";
import {
  businessProfiles,
  organizationSlugHistory,
} from "@/lib/db/schema/business-schema";
import { services } from "@/lib/db/schema/service-schema";
import {
  DEMO_ACCOUNTS,
  DEMO_FREE,
  DEMO_PRO,
  type DemoAccount,
} from "./credentials";
import { demoHistory } from "./history";
import { ensureDemoOwner } from "./seed-owner";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Mon–Sat 10:00–13:00 and 14:00–19:00; the lunch break shows split shifts. */
export const DEMO_HOURS = [1, 2, 3, 4, 5, 6].flatMap((weekday) => [
  { weekday, startMinutes: 10 * 60, endMinutes: 13 * 60 },
  { weekday, startMinutes: 14 * 60, endMinutes: 19 * 60 },
]);

/** Identical on both businesses — the plan is the only difference. */
const DEMO_SERVICES = [
  {
    name: "Saç Kesimi",
    description: "Yıkama ve fön dahil",
    durationMinutes: 45,
    priceCents: 80_000,
    depositCents: null,
  },
  {
    name: "Cilt Bakımı",
    description: "Derinlemesine temizlik ve maske",
    durationMinutes: 60,
    priceCents: 150_000,
    depositCents: 30_000,
  },
  {
    name: "Manikür",
    description: null,
    durationMinutes: 30,
    priceCents: 50_000,
    depositCents: null,
  },
];

const DEMO_PROFILE = {
  timezone: "Europe/Istanbul",
  currency: "try",
  slotGranularityMinutes: 30,
  minLeadTimeMinutes: 60,
  bookingWindowDays: 30,
  contactEmail: null,
};

/**
 * What each demo's booking page says about it. Istanbul subscriber numbers
 * never begin with 0, so the phones cannot ring anyone, and "Örnek Sokak" is
 * "Example Street".
 */
const DEMO_PAGE: Record<
  string,
  { phone: string; address: string; description: string }
> = {
  [DEMO_PRO.slug]: {
    phone: "0212 000 00 00",
    address: "Örnek Sk. No:1, Kadıköy / İstanbul",
    description:
      "Cilt bakımı, manikür ve saç. Rezerve'nin örnek işletmesi — burada alınan randevular gerçek değildir.",
  },
  [DEMO_FREE.slug]: {
    phone: "0216 000 00 00",
    address: "Örnek Sk. No:2, Üsküdar / İstanbul",
    description:
      "Saç ve sakal. Rezerve'nin ücretsiz plandaki örnek işletmesi — burada alınan randevular gerçek değildir.",
  },
};

export type DemoResetSummary = {
  bookings: number;
  /** False when another business took the address while the demo was renamed. */
  slugRestored: boolean;
  /** False when the Pro demo has no submerchant, so cannot collect kapora. */
  collectsKapora?: boolean;
};

export async function resetDemo({
  now = new Date(),
  subMerchantKey = process.env.DEMO_SUBMERCHANT_KEY,
}: {
  now?: Date;
  /** Defaults to DEMO_SUBMERCHANT_KEY; null means none, whatever the env says. */
  subMerchantKey?: string | null;
} = {}): Promise<Record<string, DemoResetSummary>> {
  const summary: Record<string, DemoResetSummary> = {};
  for (const demo of DEMO_ACCOUNTS) {
    summary[demo.slug] = await resetBusiness(demo, now, subMerchantKey);
  }
  return summary;
}

async function resetBusiness(
  demo: DemoAccount,
  now: Date,
  subMerchantKey: string | null | undefined
): Promise<DemoResetSummary> {
  const orgId = demo.orgId;

  await db
    .insert(organization)
    .values({ id: orgId, name: demo.name, slug: demo.slug, createdAt: now })
    .onConflictDoUpdate({ target: organization.id, set: { name: demo.name } });
  // Separately: a visitor may have moved the demo, and a real business taken
  // its address since. That business keeps it; the demo waits.
  let slugRestored = true;
  try {
    await db
      .update(organization)
      .set({ slug: demo.slug })
      .where(eq(organization.id, orgId));
  } catch (err) {
    if (pgErrorCode(err) !== UNIQUE_VIOLATION) throw err;
    slugRestored = false;
    console.warn(`${demo.slug}: the address is taken by another business`);
  }

  // Resets the password too — outside the transaction, through Better Auth.
  await ensureDemoOwner(demo);

  return db.transaction(async (tx) => {
    const profile = { ...DEMO_PROFILE, ...DEMO_PAGE[demo.slug] };
    await tx
      .insert(businessProfiles)
      .values({ organizationId: orgId, ...profile })
      .onConflictDoUpdate({
        target: businessProfiles.organizationId,
        set: profile,
      });

    // Visitors move the demo's address, and every move keeps the address
    // before it reserved for the demo. Those would pile up for good.
    await tx
      .delete(organizationSlugHistory)
      .where(eq(organizationSlugHistory.organizationId, orgId));

    // Bookings first: a service cannot be deleted while one refers to it.
    await tx.delete(bookings).where(eq(bookings.organizationId, orgId));
    await tx
      .delete(availabilityExceptions)
      .where(eq(availabilityExceptions.organizationId, orgId));
    await tx.delete(services).where(eq(services.organizationId, orgId));
    await tx
      .delete(availabilityRules)
      .where(eq(availabilityRules.organizationId, orgId));

    const created = await tx
      .insert(services)
      .values(DEMO_SERVICES.map((s) => ({ ...s, organizationId: orgId })))
      .returning({
        id: services.id,
        durationMinutes: services.durationMinutes,
      });
    await tx
      .insert(availabilityRules)
      .values(DEMO_HOURS.map((h) => ({ ...h, organizationId: orgId })));

    const history = demoHistory({
      now,
      timezone: DEMO_PROFILE.timezone,
      hours: DEMO_HOURS,
      services: created,
    });
    await tx
      .insert(bookings)
      .values(history.map((b) => ({ ...b, organizationId: orgId })));

    if (demo.orgId === DEMO_PRO.orgId) {
      const collectsKapora = await restoreProBilling(
        tx,
        orgId,
        now,
        subMerchantKey
      );
      return { bookings: history.length, slugRestored, collectsKapora };
    }

    // The free demo exists to show the downgrade rule: a trial started by a
    // visitor would hide it until the trial ran out.
    await tx
      .delete(orgSubscriptions)
      .where(eq(orgSubscriptions.organizationId, orgId));
    await tx
      .delete(orgPayoutAccounts)
      .where(eq(orgPayoutAccounts.organizationId, orgId));
    return { bookings: history.length, slugRestored };
  });
}

/**
 * Pro, active for a year, with no card on file — seeded, not purchased, so
 * nextChargeAt stays null and the renewal cron never tries to charge it. A
 * visitor's cancellation is undone with the rest.
 *
 * The payout account needs a real sandbox submerchant to collect kapora:
 * `bun run demo:submerchant` creates one. Without a key the existing account
 * is kept as it is, and the summary says kapora cannot be collected.
 */
async function restoreProBilling(
  tx: Tx,
  orgId: string,
  now: Date,
  subMerchantKey: string | null | undefined
): Promise<boolean> {
  const periodEnd = new Date(now.getTime() + 365 * 86_400_000);
  const active = {
    plan: "pro" as const,
    status: "active" as const,
    currentPeriodEndsAt: periodEnd,
    trialEndsAt: null,
    cancelAtPeriodEnd: false,
    nextChargeAt: null,
    cardUserKey: null,
    cardToken: null,
    lastSyncedAt: now,
  };
  await tx
    .insert(orgSubscriptions)
    .values({ organizationId: orgId, ...active })
    .onConflictDoUpdate({
      target: orgSubscriptions.organizationId,
      set: active,
    });

  if (subMerchantKey) {
    await tx
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
    return true;
  }

  const [existing] = await tx
    .select({ key: orgPayoutAccounts.subMerchantKey })
    .from(orgPayoutAccounts)
    .where(eq(orgPayoutAccounts.organizationId, orgId));
  if (existing?.key) {
    await tx
      .update(orgPayoutAccounts)
      .set({ status: "active" })
      .where(eq(orgPayoutAccounts.organizationId, orgId));
    return true;
  }
  return false;
}
