import { formatMoney } from "@/lib/format";

/** Ivory-on-night (or night-on-ivory) receipt shown before payment. */
export function BookingSummary({
  serviceName,
  when,
  durationMinutes,
  priceCents,
  depositCents,
  currency,
}: {
  serviceName: string;
  when: string;
  durationMinutes: number;
  priceCents: number;
  depositCents: number | null;
  currency: string;
}) {
  return (
    <div className="surface-ivory rounded-2xl p-5 ring-1 ring-hair">
      <p className="font-display text-2xl leading-tight">{serviceName}</p>
      <p className="mt-1 font-display text-brand-ink text-xl italic">{when}</p>
      <dl className="mt-4 grid gap-0 text-sm">
        <div className="flex items-center justify-between border-border/70 border-t py-2.5">
          <dt className="text-muted-foreground">Süre</dt>
          <dd className="font-medium">{durationMinutes} dk</dd>
        </div>
        <div className="flex items-center justify-between border-border/70 border-t py-2.5">
          <dt className="text-muted-foreground">Ücret</dt>
          <dd className="numeral text-lg">
            {formatMoney(priceCents, currency)}
          </dd>
        </div>
        {depositCents !== null && (
          <div className="flex items-center justify-between border-border/70 border-t py-2.5">
            <dt className="text-muted-foreground">Kapora · şimdi ödenir</dt>
            <dd className="numeral text-brand-ink text-lg">
              {formatMoney(depositCents, currency)}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}
