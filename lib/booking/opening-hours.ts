import { TZDate } from "@date-fns/tz";
import { type DateException, resolveIntervalsForDate } from "./exceptions";
import type { AvailabilityInterval } from "./slots";

/** A wall-clock time on a business date, as an instant. */
export function localInstant(
  dateISO: string,
  minutes: number,
  timezone: string
): Date {
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Date(
    new TZDate(
      y,
      m - 1,
      d,
      Math.floor(minutes / 60),
      minutes % 60,
      timezone
    ).getTime()
  );
}

/** The local date an instant falls on, and its minutes from local midnight. */
function localParts(
  instant: Date,
  timezone: string
): { dateISO: string; minutes: number } {
  const tz = new TZDate(instant.getTime(), timezone);
  const dateISO = [
    tz.getFullYear(),
    String(tz.getMonth() + 1).padStart(2, "0"),
    String(tz.getDate()).padStart(2, "0"),
  ].join("-");
  return { dateISO, minutes: tz.getHours() * 60 + tz.getMinutes() };
}

/**
 * Whether an appointment sits inside the hours the business keeps on its
 * date — the weekly hours, or that date's exception.
 *
 * Customers can only ever book inside them, because their slots are cut from
 * these same hours. Owners may book outside — the regular squeezed in after
 * closing — but only once asked, and this is the question. Off the slot grid
 * is fine for an owner; running past midnight is simply outside.
 */
export function withinOpeningHours({
  rules,
  exceptions,
  startsAt,
  endsAt,
  timezone,
}: {
  rules: AvailabilityInterval[];
  exceptions: DateException[];
  startsAt: Date;
  endsAt: Date;
  timezone: string;
}): boolean {
  const { dateISO, minutes: start } = localParts(startsAt, timezone);
  const end =
    start + Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000);
  if (end > 24 * 60) return false;
  return resolveIntervalsForDate(rules, exceptions, dateISO, timezone).some(
    (interval) => interval.startMinutes <= start && end <= interval.endMinutes
  );
}
