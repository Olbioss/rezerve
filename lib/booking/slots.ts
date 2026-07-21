import { TZDate } from "@date-fns/tz";

export type AvailabilityInterval = {
  weekday: number; // 0 = Sunday … 6 = Saturday
  startMinutes: number; // minutes from local midnight
  endMinutes: number;
};

export type BookedInterval = {
  startsAt: Date;
  endsAt: Date;
};

export type SlotInput = {
  /** Local business day, e.g. "2026-08-05". */
  dateISO: string;
  /** IANA timezone of the business. */
  timezone: string;
  /** Weekly availability rules (any weekday; non-matching are ignored). */
  rules: AvailabilityInterval[];
  durationMinutes: number;
  granularityMinutes: number;
  /** Confirmed + live pending bookings, as UTC instants. */
  existingBookings: BookedInterval[];
  now: Date;
  minLeadTimeMinutes: number;
};

/**
 * Compute bookable slot starts (UTC instants) for one local business day.
 *
 * Local wall times are converted to instants via TZDate, so DST transitions
 * resolve the way a wall clock in the business's timezone would.
 */
export function computeSlotsForDay(input: SlotInput): Date[] {
  const {
    dateISO,
    timezone,
    rules,
    durationMinutes,
    granularityMinutes,
    existingBookings,
    now,
    minLeadTimeMinutes,
  } = input;

  const [year, month, day] = dateISO.split("-").map(Number);
  const weekday = new TZDate(year, month - 1, day, timezone).getDay();
  const dayRules = rules.filter((rule) => rule.weekday === weekday);

  const earliestStart = new Date(now.getTime() + minLeadTimeMinutes * 60_000);

  const slots: Date[] = [];
  for (const rule of dayRules) {
    for (
      let startMinutes = rule.startMinutes;
      startMinutes + durationMinutes <= rule.endMinutes;
      startMinutes += granularityMinutes
    ) {
      const slotStart = localMinutesToInstant(
        year,
        month,
        day,
        startMinutes,
        timezone
      );
      const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60_000);

      if (slotStart < earliestStart) continue;
      const overlaps = existingBookings.some(
        (booking) => slotStart < booking.endsAt && slotEnd > booking.startsAt
      );
      if (overlaps) continue;

      slots.push(slotStart);
    }
  }

  return slots.sort((a, b) => a.getTime() - b.getTime());
}

function localMinutesToInstant(
  year: number,
  month: number,
  day: number,
  minutes: number,
  timezone: string
): Date {
  const tzDate = new TZDate(
    year,
    month - 1,
    day,
    Math.floor(minutes / 60),
    minutes % 60,
    timezone
  );
  return new Date(tzDate.getTime());
}
