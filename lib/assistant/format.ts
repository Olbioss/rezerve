function parts(
  instant: Date,
  timezone: string,
  options: Intl.DateTimeFormatOptions
): Intl.DateTimeFormatPart[] {
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: timezone,
    ...options,
  }).formatToParts(instant);
}

function pick(
  list: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes
): string {
  return list.find((part) => part.type === type)?.value ?? "";
}

/**
 * "15:30" — an instant's wall-clock time in the business's timezone. h23, so
 * midnight is 00:00 and never 24:00.
 */
export function localTime(instant: Date, timezone: string): string {
  const list = parts(instant, timezone, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return `${pick(list, "hour")}:${pick(list, "minute")}`;
}

/**
 * "Cumartesi 17 Ekim 15:30" — how the assistant reads a time back to a
 * customer: weekday first, as people say it, in the business's timezone.
 * Built from parts, so it never depends on a locale's word order.
 */
export function localLabel(instant: Date, timezone: string): string {
  const list = parts(instant, timezone, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return `${pick(list, "weekday")} ${pick(list, "day")} ${pick(list, "month")} ${localTime(instant, timezone)}`;
}
