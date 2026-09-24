import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { organization } from "./auth-schema";

/**
 * Weekly opening hours in the business's local wall time.
 * Multiple rows per weekday = split shifts. Only bookings are stored in UTC.
 */
export const availabilityRules = pgTable(
  "availability_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** 0 = Sunday … 6 = Saturday */
    weekday: smallint("weekday").notNull(),
    /** Minutes from local midnight, e.g. 540 = 09:00. */
    startMinutes: integer("start_minutes").notNull(),
    endMinutes: integer("end_minutes").notNull(),
  },
  (table) => [
    index("availability_rules_organization_id_idx").on(table.organizationId),
    unique("availability_rules_org_weekday_start_unique").on(
      table.organizationId,
      table.weekday,
      table.startMinutes
    ),
    check(
      "availability_rules_weekday_range",
      sql`${table.weekday} BETWEEN 0 AND 6`
    ),
    check(
      "availability_rules_interval_valid",
      sql`${table.startMinutes} >= 0 AND ${table.endMinutes} <= 1440 AND ${table.endMinutes} > ${table.startMinutes}`
    ),
  ]
);

/**
 * Closures and one-off hours over an inclusive range of local dates: a
 * holiday, a week away, a Saturday that closes at one. lib/booking/exceptions.ts
 * turns these plus the weekly rules into the hours that apply on a date.
 *
 * Ranges for one business never overlap — availability_exceptions_no_overlap,
 * an exclusion constraint in the hand-written part of the migration, like
 * bookings_no_overlap — so a date is governed by at most one exception.
 */
export const availabilityExceptions = pgTable(
  "availability_exceptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    startsOn: date("starts_on", { mode: "string" }).notNull(),
    endsOn: date("ends_on", { mode: "string" }).notNull(),
    /**
     * Empty means closed all day; otherwise these replace the weekly hours.
     * Minutes from local midnight, validated on write in
     * lib/actions/availability.ts.
     */
    intervals: jsonb("intervals")
      .$type<{ startMinutes: number; endMinutes: number }[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** Shown to the owner only, e.g. "Kurban Bayramı". */
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("availability_exceptions_org_ends_idx").on(
      table.organizationId,
      table.endsOn
    ),
    check(
      "availability_exceptions_range_valid",
      sql`${table.endsOn} >= ${table.startsOn}`
    ),
    check(
      "availability_exceptions_intervals_array",
      sql`jsonb_typeof(${table.intervals}) = 'array'`
    ),
  ]
);
