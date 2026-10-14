import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { organization } from "./auth-schema";
import { services } from "./service-schema";

export const bookingStatus = pgEnum("booking_status", [
  "pending",
  "confirmed",
  "cancelled",
]);

/** Who called a booking off. Null for a lapsed hold, which nobody did. */
export const bookingCancelledBy = pgEnum("booking_cancelled_by", [
  "owner",
  "customer",
]);

/**
 * Where a booking came from: the public booking form, the owner's panel, or
 * the chat assistant on a customer's confirmed request (through /api/mcp).
 */
export const bookingSource = pgEnum("booking_source", [
  "web",
  "owner",
  "assistant",
]);

/**
 * A booked (or held) appointment. Instants are UTC; display converts to the
 * business timezone. Overlaps are prevented by the bookings_no_overlap
 * exclusion constraint (see the hand-written part of the migration).
 */
export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "restrict" }),
    customerName: text("customer_name").notNull(),
    /**
     * Always set by the public booking form, which needs it for the
     * confirmation. Optional when the owner books someone in — a phone
     * booking often comes with a name and a number and nothing else.
     */
    customerEmail: text("customer_email"),
    /** Optional, and only as the customer typed it — see lib/phone.ts. */
    customerPhone: text("customer_phone"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: bookingStatus("status").notNull().default("confirmed"),
    /** Deposit charged at booking time, snapshotted from the service. */
    depositCents: integer("deposit_cents"),
    /** iyzico Checkout Form token for the deposit payment, if any. */
    paymentToken: text("payment_token").unique(),
    /**
     * iyzico's item-level transaction id. Marketplace funds are held until the
     * platform approves this transaction, so it is what released the kapora to
     * the business — kept so a failed approval can be retried and a payment
     * traced or refunded later.
     */
    paymentTransactionId: text("payment_transaction_id"),
    /**
     * When the kapora was returned to the customer. Cancelling is the only
     * thing that sets it, and it doubles as the idempotency guard — a refund
     * must never run twice.
     */
    depositRefundedAt: timestamp("deposit_refunded_at", { withTimezone: true }),
    /** Only set while status = 'pending'; hold is released after this. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: bookingCancelledBy("cancelled_by"),
    /** Where the booking came from — see bookingSource. */
    source: bookingSource("source").notNull().default("web"),
    /**
     * The chat customer an assistant booking belongs to: an opaque HMAC the
     * assistant derives from the channel's user id, so no Telegram id or
     * phone number is ever stored here. It is the credential for that
     * customer's later moves and cancellations, the way a booking's own uuid
     * is on its page.
     */
    customerRef: text("customer_ref"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("bookings_org_starts_at_idx").on(
      table.organizationId,
      table.startsAt
    ),
    index("bookings_org_customer_ref_idx").on(
      table.organizationId,
      table.customerRef
    ),
    check("bookings_time_order", sql`${table.endsAt} > ${table.startsAt}`),
    check(
      "bookings_assistant_has_customer_ref",
      sql`${table.source} <> 'assistant' OR ${table.customerRef} IS NOT NULL`
    ),
  ]
);

/**
 * One row per attempt to create a booking, used only for throttling.
 *
 * createBooking is public, unauthenticated and permanently holds a slot
 * through the exclusion constraint, so an unthrottled one lets a single
 * visitor fill a calendar and leave every later one looking at a wrecked
 * demo. Better Auth's own rate limiting does not cover this: it guards
 * /api/auth/* only, and this is a server action.
 *
 * Rows are pruned on the way past rather than by a scheduled job — the window
 * is an hour, so anything older has no bearing on any decision.
 */
export const bookingAttempts = pgTable(
  "booking_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** Null when the proxy sent no forwarded-for header. */
    ip: text("ip"),
    /** The form's visitor. Null for an attempt the assistant made. */
    email: text("email"),
    /** The assistant's customer, for attempts made through /api/mcp. */
    customerRef: text("customer_ref"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("booking_attempts_org_created_idx").on(
      table.organizationId,
      table.createdAt
    ),
    check(
      "booking_attempts_has_identity",
      sql`${table.email} IS NOT NULL OR ${table.customerRef} IS NOT NULL`
    ),
  ]
);
