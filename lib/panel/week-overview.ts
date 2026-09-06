import "server-only";
import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { availabilityRules } from "@/lib/db/schema/availability-schema";
import { bookings } from "@/lib/db/schema/booking-schema";
import type { WeekGrid } from "./week-grid";
import { buildWeekGrid, localMidnight, windowDayISOs } from "./week-grid";

export type { CellState, WeekGrid } from "./week-grid";

/**
 * Loads the rules and bookings for the next seven days, then hands them to
 * `buildWeekGrid`. The window matches the stat tiles on the same page.
 */
export async function getWeekOverview(
  organizationId: string,
  timezone: string,
  now: Date = new Date()
): Promise<WeekGrid> {
  const dayISOs = windowDayISOs(now, timezone);
  const weekStart = localMidnight(dayISOs[0], timezone);
  const weekEnd = new Date(
    localMidnight(dayISOs[6], timezone).getTime() + 86_400_000
  );

  const [rules, weekBookings] = await Promise.all([
    db.query.availabilityRules.findMany({
      where: eq(availabilityRules.organizationId, organizationId),
    }),
    db
      .select({
        startsAt: bookings.startsAt,
        endsAt: bookings.endsAt,
        status: bookings.status,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.organizationId, organizationId),
          gte(bookings.startsAt, weekStart),
          lt(bookings.startsAt, weekEnd),
          inArray(bookings.status, ["confirmed", "pending"])
        )
      ),
  ]);

  return buildWeekGrid({ now, timezone, rules, bookings: weekBookings });
}
