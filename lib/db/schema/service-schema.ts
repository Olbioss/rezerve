import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { organization } from "./auth-schema";

export const services = pgTable(
  "services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    durationMinutes: integer("duration_minutes").notNull(),
    priceCents: integer("price_cents").notNull(),
    /** null = no deposit required; booking confirms instantly. */
    depositCents: integer("deposit_cents"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("services_organization_id_idx").on(table.organizationId),
    check("services_duration_positive", sql`${table.durationMinutes} > 0`),
    check("services_price_non_negative", sql`${table.priceCents} >= 0`),
    check(
      "services_deposit_valid",
      sql`${table.depositCents} IS NULL OR ${table.depositCents} > 0`
    ),
  ]
);
