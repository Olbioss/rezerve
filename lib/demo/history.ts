import { TZDate } from "@date-fns/tz";
import { localInstant } from "@/lib/booking/opening-hours";
import { type AvailabilityInterval, weekdayFor } from "@/lib/booking/slots";

export type DemoService = { id: string; durationMinutes: number };

export type DemoBooking = {
  serviceId: string;
  customerName: string;
  /** Never an address: cancelling a demo booking must not email anyone. */
  customerEmail: null;
  customerPhone: string;
  startsAt: Date;
  endsAt: Date;
  status: "confirmed" | "cancelled";
  cancelledAt: Date | null;
};

const NAMES = [
  "Ayşe Yılmaz",
  "Mehmet Kaya",
  "Zeynep Demir",
  "Emre Şahin",
  "Elif Çelik",
  "Burak Yıldız",
  "Selin Aydın",
  "Can Öztürk",
  "Deniz Arslan",
  "Ece Doğan",
  "Kerem Koç",
  "Merve Kurt",
];

/** Where a day's booking may start, rotated so the week looks lived in. */
const START_TIMES = [10 * 60, 11 * 60 + 30, 14 * 60 + 30, 16 * 60 + 30];

const PAST_BOOKINGS = 40;
const UPCOMING_BOOKINGS = 14;

/** The business-local date `offset` days from now. */
function localDate(now: Date, timezone: string, offset: number): string {
  const tz = new TZDate(now.getTime() + offset * 86_400_000, timezone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${tz.getFullYear()}-${pad(tz.getMonth() + 1)}-${pad(tz.getDate())}`;
}

/**
 * A believable booking history for a demo business: one booking on each open
 * day, the last 40 of them behind `now` and 14 ahead. Enough that the past
 * tab paginates and the week heatmap has something in it, few enough that a
 * visitor still finds free slots.
 *
 * Deterministic for a given `now`, inside the published hours, and never two
 * on one day, so the exclusion constraint has nothing to refuse. Phones only:
 * Istanbul subscriber numbers never begin with 0, so 0212 000 … rings no one.
 */
export function demoHistory({
  now,
  timezone,
  hours,
  services,
}: {
  now: Date;
  timezone: string;
  hours: AvailabilityInterval[];
  services: DemoService[];
}): DemoBooking[] {
  const bookings: DemoBooking[] = [];

  const onDay = (offset: number, index: number): DemoBooking | null => {
    const dateISO = localDate(now, timezone, offset);
    const weekday = weekdayFor(dateISO, timezone);
    const dayHours = hours.filter((h) => h.weekday === weekday);
    const service = services[index % services.length];

    // The first start time, from this booking's place in the rotation, that
    // fits the service inside the day's hours.
    for (let step = 0; step < START_TIMES.length; step++) {
      const start = START_TIMES[(index + step) % START_TIMES.length];
      const end = start + service.durationMinutes;
      if (
        !dayHours.some((h) => h.startMinutes <= start && end <= h.endMinutes)
      ) {
        continue;
      }
      const startsAt = localInstant(dateISO, start, timezone);
      const cancelled = offset < 0 && index % 7 === 3;
      return {
        serviceId: service.id,
        customerName: NAMES[index % NAMES.length],
        customerEmail: null,
        customerPhone: `0212 000 ${String(10 + (index % 90)).padStart(2, "0")} ${String(10 + ((index * 7) % 90)).padStart(2, "0")}`,
        startsAt,
        endsAt: new Date(startsAt.getTime() + service.durationMinutes * 60_000),
        status: cancelled ? "cancelled" : "confirmed",
        cancelledAt: cancelled
          ? new Date(startsAt.getTime() - 86_400_000)
          : null,
      };
    }
    return null;
  };

  for (
    let offset = -1, count = 0;
    count < PAST_BOOKINGS && offset > -120;
    offset--
  ) {
    const booking = onDay(offset, bookings.length);
    if (booking) {
      bookings.push(booking);
      count++;
    }
  }
  for (
    let offset = 1, count = 0;
    count < UPCOMING_BOOKINGS && offset < 120;
    offset++
  ) {
    const booking = onDay(offset, bookings.length);
    if (booking) {
      bookings.push(booking);
      count++;
    }
  }
  return bookings;
}
