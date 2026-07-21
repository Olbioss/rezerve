import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  smallint,
  text,
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
