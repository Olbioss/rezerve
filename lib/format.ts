const currencySymbols: Record<string, string> = {
  usd: "$",
  eur: "€",
  gbp: "£",
  try: "₺",
};

export function formatMoney(cents: number, currency: string): string {
  const symbol = currencySymbols[currency] ?? `${currency.toUpperCase()} `;
  const amount = (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
  return `${symbol}${amount}`;
}

/** 540 → "09:00" */
export function minutesToTime(minutes: number): string {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}`;
}

/** "09:00" → 540 */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export const WEEKDAYS = [
  "Pazar",
  "Pazartesi",
  "Salı",
  "Çarşamba",
  "Perşembe",
  "Cuma",
  "Cumartesi",
] as const;
