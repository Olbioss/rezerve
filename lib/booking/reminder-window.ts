import { TZDate } from "@date-fns/tz";
import { localInstant } from "./opening-hours";

/** The calendar date `days` after the one `instant` falls on, in `timezone`. */
function localDateAfter(instant: Date, timezone: string, days: number): string {
  const local = new TZDate(instant.getTime(), timezone);
  return new Date(
    Date.UTC(local.getFullYear(), local.getMonth(), local.getDate() + days)
  )
    .toISOString()
    .slice(0, 10);
}

/**
 * Tomorrow in the business's own timezone, as instants: from its next local
 * midnight to the one after. Usually 24 hours long, but 23 or 25 on a day the
 * clocks change — which is why it is two midnights and not one plus a day.
 *
 * Pure, with `now` injected, like the slot engine.
 */
export function tomorrowWindow(
  now: Date,
  timezone: string
): { start: Date; end: Date } {
  return {
    start: localInstant(localDateAfter(now, timezone, 1), 0, timezone),
    end: localInstant(localDateAfter(now, timezone, 2), 0, timezone),
  };
}
