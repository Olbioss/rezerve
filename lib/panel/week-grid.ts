import { TZDate } from "@date-fns/tz";
import {
  type DateException,
  resolveIntervalsForDate,
} from "@/lib/booking/exceptions";
import type { AvailabilityInterval } from "@/lib/booking/slots";

/** What one hour of one day looks like on the overview grid. */
export type CellState = "closed" | "free" | "pending" | "confirmed";

export type GridBooking = {
  startsAt: Date;
  endsAt: Date;
  status: "confirmed" | "pending" | "cancelled";
};

export type WeekGridInput = {
  now: Date;
  timezone: string;
  rules: AvailabilityInterval[];
  /** Holidays and one-off hours touching the window. */
  exceptions?: DateException[];
  /** Bookings starting inside the local week. */
  bookings: GridBooking[];
};

export type WeekGrid = {
  /** Today first, then the six days after it. */
  days: { dateISO: string; weekday: string; dayNumber: string }[];
  /** Hour labels down the left edge, derived from the opening hours. */
  hours: number[];
  /** cells[hourIndex][dayIndex] */
  cells: CellState[][];
  rangeLabel: string;
  /** Null when the business has no opening hours set yet. */
  occupancyPercent: number | null;
  bookedHours: number;
  openHours: number;
};

function isoOf(date: TZDate): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Local midnight for a business day, as a UTC instant. */
export function localMidnight(dateISO: string, timezone: string): Date {
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Date(new TZDate(y, m - 1, d, timezone).getTime());
}

/**
 * The next seven local dates, starting today.
 *
 * Deliberately a rolling window rather than the Monday–Sunday week the
 * artifact draws: the stat tiles beside this grid count `now` to `now + 7d`,
 * and two windows labelled "bu hafta" on one screen disagreed with each
 * other. A calendar week is also dead weight by Sunday, when every column
 * is spent and tomorrow's bookings fall outside it.
 */
export function windowDayISOs(now: Date, timezone: string): string[] {
  const today = new TZDate(now.getTime(), timezone);
  return Array.from({ length: 7 }, (_, i) =>
    isoOf(new TZDate(today.getTime() + i * 86_400_000, timezone))
  );
}

/**
 * The owner's week at a glance: which hours are open, which are spoken for,
 * and how full the week is overall.
 *
 * Everything is bucketed in the business's timezone — an owner in Istanbul
 * reading a grid of UTC hours would see their day in the wrong column. Kept
 * free of the database so the bucketing can be tested directly.
 */
export function buildWeekGrid(input: WeekGridInput): WeekGrid {
  const { now, timezone, rules, exceptions = [], bookings } = input;
  const dayISOs = windowDayISOs(now, timezone);

  // Each column's actual hours: its weekday's rules, unless a holiday or
  // one-off hours say otherwise for that date.
  const dayHours = dayISOs.map((dateISO) =>
    resolveIntervalsForDate(rules, exceptions, dateISO, timezone)
  );
  const allHours = dayHours.flat();

  // Row range follows the opening hours, so a salon open 12–21 doesn't get
  // a grid of empty mornings.
  const span = allHours.length
    ? {
        from: Math.floor(Math.min(...allHours.map((r) => r.startMinutes)) / 60),
        to: Math.ceil(Math.max(...allHours.map((r) => r.endMinutes)) / 60),
      }
    : { from: 9, to: 18 };
  const hours = Array.from(
    { length: Math.max(1, Math.min(span.to - span.from, 16)) },
    (_, i) => span.from + i
  );

  // Bookings, bucketed into local day + minute range.
  const placed = bookings
    .filter((booking) => booking.status !== "cancelled")
    .map((booking) => {
      const start = new TZDate(booking.startsAt.getTime(), timezone);
      const end = new TZDate(booking.endsAt.getTime(), timezone);
      const startISO = isoOf(start);
      return {
        dateISO: startISO,
        startMin: start.getHours() * 60 + start.getMinutes(),
        // A booking running past midnight is clamped to its starting day.
        endMin:
          isoOf(end) === startISO
            ? end.getHours() * 60 + end.getMinutes()
            : 24 * 60,
        status: booking.status,
      };
    });

  const cells: CellState[][] = hours.map((hour) =>
    dayISOs.map((dateISO, dayIndex) => {
      const hourStart = hour * 60;
      const hourEnd = hourStart + 60;

      const open = dayHours[dayIndex].some(
        (interval) =>
          interval.startMinutes < hourEnd && interval.endMinutes > hourStart
      );
      if (!open) return "closed";

      const hits = placed.filter(
        (booking) =>
          booking.dateISO === dateISO &&
          booking.startMin < hourEnd &&
          booking.endMin > hourStart
      );
      if (hits.some((booking) => booking.status === "confirmed")) {
        return "confirmed";
      }
      if (hits.length > 0) return "pending";
      return "free";
    })
  );

  // Seven consecutive days hold each weekday once, so without exceptions this
  // is the weekly total it always was.
  const openMinutes = allHours.reduce(
    (total, interval) => total + (interval.endMinutes - interval.startMinutes),
    0
  );
  const bookedMinutes = placed
    .filter((booking) => booking.status === "confirmed")
    .reduce((total, booking) => total + (booking.endMin - booking.startMin), 0);

  const dayLabel = (dateISO: string, withMonth: boolean) => {
    const [y, m, d] = dateISO.split("-").map(Number);
    return new TZDate(y, m - 1, d, timezone).toLocaleDateString("tr-TR", {
      day: "numeric",
      ...(withMonth ? { month: "short" } : {}),
      timeZone: timezone,
    });
  };

  return {
    days: dayISOs.map((dateISO) => {
      const [y, m, d] = dateISO.split("-").map(Number);
      const date = new TZDate(y, m - 1, d, timezone);
      return {
        dateISO,
        weekday: date
          .toLocaleDateString("tr-TR", { weekday: "short", timeZone: timezone })
          .toLocaleUpperCase("tr-TR"),
        dayNumber: String(date.getDate()),
      };
    }),
    hours,
    cells,
    rangeLabel: `${dayLabel(dayISOs[0], false)}–${dayLabel(dayISOs[6], true)}`,
    // No hours set yet means no denominator — show a dash, never NaN%.
    occupancyPercent:
      openMinutes > 0 ? Math.round((bookedMinutes / openMinutes) * 100) : null,
    bookedHours: Math.round(bookedMinutes / 60),
    openHours: Math.round(openMinutes / 60),
  };
}
