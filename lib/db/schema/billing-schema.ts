import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { organization } from "./auth-schema";

/** What the org is entitled to. Online kapora is the only paid feature. */
export const billingPlan = pgEnum("billing_plan", ["free", "pro"]);

/**
 * Our subscription vocabulary, mapped from Iyzipay.SUBSCRIPTION_STATUS at the
 * edge. Deliberately wider than v1 needs: extending a pgEnum after the fact
 * means ALTER TYPE ... ADD VALUE, which cannot run inside a transaction.
 */
export const subscriptionStatus = pgEnum("subscription_status", [
  "none",
  "pending",
  "trialing",
  "active",
  "past_due",
  "cancelled",
  "expired",
]);

/** Our own model — iyzico exposes no submerchant approval signal via API. */
export const payoutAccountStatus = pgEnum("payout_account_status", [
  "pending",
  "active",
  "rejected",
]);

export const submerchantType = pgEnum("submerchant_type", [
  "personal",
  "private_company",
  "limited_or_joint_stock_company",
]);

export const billingEventSource = pgEnum("billing_event_source", [
  "callback",
  "poll",
  "manual",
]);

export const chargeStatus = pgEnum("subscription_charge_status", [
  "succeeded",
  "failed",
]);

/**
 * Platform subscription, 1:1 with the organization. Created lazily on the
 * first checkout — an absent row means the free tier, which the entitlement
 * resolver has to handle anyway.
 */
export const orgSubscriptions = pgTable(
  "org_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .unique()
      .references(() => organization.id, { onDelete: "cascade" }),
    plan: billingPlan("plan").notNull().default("free"),
    status: subscriptionStatus("status").notNull().default("none"),
    /** iyzico subscription Checkout Form token — the callback idempotency key. */
    checkoutToken: text("checkout_token").unique(),
    iyzicoCustomerRef: text("iyzico_customer_ref"),
    iyzicoSubscriptionRef: text("iyzico_subscription_ref").unique(),
    /** Kept so a later price change doesn't rewrite history. */
    pricingPlanRef: text("pricing_plan_ref"),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    currentPeriodEndsAt: timestamp("current_period_ends_at", {
      withTimezone: true,
    }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    /**
     * The stored card renewals are charged against. Captured by the first
     * checkout — iyzico has no card-storage-without-payment on this account
     * (/v2/ucs/init returns 42205), so capture rides a real payment and the
     * card number never reaches this server.
     */
    cardUserKey: text("card_user_key"),
    cardToken: text("card_token"),
    /** When the renewal cron should next attempt a charge. */
    nextChargeAt: timestamp("next_charge_at", { withTimezone: true }),
    /** Retained for the audit trail; no longer drives polling. */
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("org_subscriptions_status_idx").on(table.status),
    // The cron's working set: due subscriptions, cheaply.
    index("org_subscriptions_next_charge_idx").on(table.nextChargeAt),
  ]
);

/**
 * One row per billing period, per organization.
 *
 * The unique constraint is the whole point: a retried or overlapping cron run
 * cannot charge the same period twice, because the second insert loses. This
 * is the same doctrine as bookings_no_overlap — make the bad state
 * unrepresentable rather than trusting the caller to be careful.
 */
export const subscriptionCharges = pgTable(
  "subscription_charges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** The period being paid for — the idempotency key, not a timestamp. */
    periodStart: date("period_start").notNull(),
    status: chargeStatus("status").notNull(),
    amountCents: integer("amount_cents").notNull(),
    /** iyzico paymentId on success. */
    paymentRef: text("payment_ref"),
    /** 1-based; dunning gives up after RETRY_DAYS attempts. */
    attempt: integer("attempt").notNull().default(1),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("subscription_charges_org_period").on(
      table.organizationId,
      table.periodStart
    ),
    index("subscription_charges_org_idx").on(table.organizationId),
  ]
);

/**
 * The org's iyzico submerchant — where its customers' kapora settles.
 *
 * Legal/payout data lives here rather than on business_profiles because that
 * row is handed whole to the public booking page (see BusinessContext in
 * lib/booking/get-available-slots.ts).
 */
export const orgPayoutAccounts = pgTable(
  "org_payout_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .unique()
      .references(() => organization.id, { onDelete: "cascade" }),
    status: payoutAccountStatus("status").notNull().default("pending"),
    /** Returned by iyzico; goes on the basket item to route the deposit. */
    subMerchantKey: text("sub_merchant_key").unique(),
    /** Always the organization id — makes create idempotent and recoverable. */
    subMerchantExternalId: text("sub_merchant_external_id").notNull().unique(),
    merchantType: submerchantType("merchant_type").notNull(),
    name: text("name").notNull(),
    legalCompanyTitle: text("legal_company_title"),
    contactName: text("contact_name"),
    contactSurname: text("contact_surname"),
    /** TCKN — personal and private_company. */
    identityNumber: text("identity_number"),
    /** Vergi no — limited_or_joint_stock_company. */
    taxNumber: text("tax_number"),
    taxOffice: text("tax_office"),
    iban: text("iban").notNull(),
    address: text("address").notNull(),
    gsmNumber: text("gsm_number").notNull(),
    email: text("email").notNull(),
    /** Last iyzico rejection, shown next to the "Tekrar dene" button. */
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check(
      "payout_accounts_identity_or_tax",
      sql`${table.identityNumber} IS NOT NULL OR ${table.taxNumber} IS NOT NULL`
    ),
    // Makes "entitled, but nowhere to send the money" unrepresentable.
    check(
      "payout_accounts_active_has_key",
      sql`${table.status} <> 'active' OR ${table.subMerchantKey} IS NOT NULL`
    ),
  ]
);

/**
 * Subscription state audit. Warranted here (and not for bookings) because it
 * arrives from several unordered sources: the browser callback and the lazy
 * poll, plus manual fixes.
 */
export const billingEvents = pgTable(
  "billing_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Nullable: a result may name a reference we don't recognise. */
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    source: billingEventSource("source").notNull(),
    /** e.g. "subscription.activated". */
    kind: text("kind").notNull(),
    iyzicoRef: text("iyzico_ref"),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("billing_events_org_created_at_idx").on(
      table.organizationId,
      table.createdAt
    ),
    index("billing_events_iyzico_ref_idx").on(table.iyzicoRef),
  ]
);
