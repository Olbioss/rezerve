import { type AvailabilityInterval, weekdayFor } from "./slots";

/** Opening hours within one day. No weekday: an exception is about dates. */
export type DayInterval = { startMinutes: number; endMinutes: number };

/**
 * A closure or one-off hours over an inclusive range of local business
 * dates — a holiday, a week away, a Saturday that closes at one.
 */
export type DateException = {
  /** YYYY-MM-DD, local to the business. */
  startsOn: string;
  /** YYYY-MM-DD, inclusive. */
  endsOn: string;
  /** Empty means closed all day; otherwise these replace the weekly hours. */
  intervals: DayInterval[];
};

/**
 * The exception covering a date, if any. The database refuses overlapping
 * ranges for one business, so there is at most one. ISO dates compare
 * correctly as strings.
 */
export function exceptionOn(
  exceptions: DateException[],
  dateISO: string
): DateException | undefined {
  return exceptions.find(
    (exception) => exception.startsOn <= dateISO && dateISO <= exception.endsOn
  );
}

/**
 * The opening hours that actually apply on one local date.
 *
 * Runs before computeSlotsForDay rather than inside it, so the slot engine
 * and its DST tests stay exactly as they were: it still receives weekly-shaped
 * intervals, and filters them by the date's weekday. That is why one-off hours
 * are stamped with the weekday — without it, a Sunday opening on a business
 * closed on Sundays would be filtered straight back out.
 */
export function resolveIntervalsForDate(
  rules: AvailabilityInterval[],
  exceptions: DateException[],
  dateISO: string,
  timezone: string
): AvailabilityInterval[] {
  const weekday = weekdayFor(dateISO, timezone);
  const exception = exceptionOn(exceptions, dateISO);
  if (!exception) return rules.filter((rule) => rule.weekday === weekday);
  return exception.intervals.map(({ startMinutes, endMinutes }) => ({
    weekday,
    startMinutes,
    endMinutes,
  }));
}

/**
 * For the booking page's date strip, which greys out closed days by weekday:
 * the dates in `dayISOs` where an exception decides instead — false for a
 * closure, true for one-off hours. Dates no exception touches are absent.
 */
export function dateOverrides(
  exceptions: DateException[],
  dayISOs: string[]
): Record<string, boolean> {
  const overrides: Record<string, boolean> = {};
  for (const dateISO of dayISOs) {
    const exception = exceptionOn(exceptions, dateISO);
    if (exception) overrides[dateISO] = exception.intervals.length > 0;
  }
  return overrides;
}
