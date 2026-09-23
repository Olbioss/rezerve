import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organization } from "./auth-schema";

/** Business settings, 1:1 with the Better Auth organization (org slug = public URL). */
export const businessProfiles = pgTable("business_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    .notNull()
    .unique()
    .references(() => organization.id, { onDelete: "cascade" }),
  /** IANA timezone, e.g. "Europe/Istanbul". All hours are local to this. */
  timezone: text("timezone").notNull(),
  currency: text("currency").notNull().default("try"),
  slotGranularityMinutes: integer("slot_granularity_minutes")
    .notNull()
    .default(30),
  minLeadTimeMinutes: integer("min_lead_time_minutes").notNull().default(60),
  bookingWindowDays: integer("booking_window_days").notNull().default(60),
  /** Booking notifications go here; falls back to the owner's login email. */
  contactEmail: text("contact_email"),
  /**
   * Public, unlike contactEmail: shown on the booking page and given to a
   * customer whose booking is cancelled, as the way to reach the business.
   */
  phone: text("phone"),
  /** Public. Free text, linked to a map search on the booking page. */
  address: text("address"),
  /** Public. A few sentences under the business name on the booking page. */
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
