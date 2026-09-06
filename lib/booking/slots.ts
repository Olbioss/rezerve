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

/**
 * One slot on the grid. `taken` slots are shown struck through rather than
 * hidden — the booking page promises "dolu saatleriniz kapalı", so a
 * customer should see the shape of the day, not a suspiciously short list.
 */
export type DaySlot = {
  start: Date;
  taken: boolean;
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

/** The local weekday (0 = Sunday) a business date falls on. */
export function weekdayFor(dateISO: string, timezone: string): number {
  const [year, month, day] = dateISO.split("-").map(Number);
  return new TZDate(year, month - 1, day, timezone).getDay();
}

/**
 * Compute the slot grid for one local business day.
 *
 * Slots that overlap a live booking are returned with `taken: true`. Slots
 * that fall before the lead time — already past, or too soon to book — are
 * omitted entirely: a 09:00 slot at 14:00 is gone, not "taken".
 *
 * Local wall times are converted to instants via TZDate, so DST transitions
 * resolve the way a wall clock in the business's timezone would.
 */
export function computeSlotsForDay(input: SlotInput): DaySlot[] {
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
  const weekday = weekdayFor(dateISO, timezone);
  const dayRules = rules.filter((rule) => rule.weekday === weekday);

  const earliestStart = new Date(now.getTime() + minLeadTimeMinutes * 60_000);

  const slots: DaySlot[] = [];
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
      const taken = existingBookings.some(
        (booking) => slotStart < booking.endsAt && slotEnd > booking.startsAt
      );

      slots.push({ start: slotStart, taken });
    }
  }

  return slots.sort((a, b) => a.start.getTime() - b.start.getTime());
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
