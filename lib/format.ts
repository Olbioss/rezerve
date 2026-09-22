// TRY is the only currency the product offers: iyzico Marketplace settles in
// it, so anything else was a dropdown entry that could never be saved. The
// code fallback below stays for rows written before that was enforced.
const currencySymbols: Record<string, string> = {
  try: "₺",
};

export function formatMoney(cents: number, currency: string): string {
  const symbol = currencySymbols[currency] ?? `${currency.toUpperCase()} `;
  // Turkish grouping: 1.500, and 1.500,50 when there are kuruş to show.
  const whole = cents % 100 === 0;
  const amount = new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(cents / 100);
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
