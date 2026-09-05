import { ChevronRightIcon } from "lucide-react";
import { formatMoney } from "@/lib/format";

export type BookableService = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number;
  depositCents: number | null;
};

/** One tappable service on step 1 of the booking flow. */
export function ServiceCard({
  service,
  currency,
  onSelect,
}: {
  service: BookableService;
  currency: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="group flex w-full items-center gap-4 rounded-2xl bg-card px-5 py-4 text-left ring-1 ring-border transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:ring-brand/60 focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
    >
      <span className="min-w-0 flex-1">
        <span className="block font-display text-xl leading-tight">
          {service.name}
        </span>
        {service.description && (
          <span className="mt-1 block text-muted-foreground text-sm">
            {service.description}
          </span>
        )}
        <span className="eyebrow mt-2 block text-brand-ink">
          {service.durationMinutes} dk
          {service.depositCents
            ? ` · ${formatMoney(service.depositCents, currency)} kapora`
            : ""}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span className="numeral text-2xl">
          {formatMoney(service.priceCents, currency)}
        </span>
        <ChevronRightIcon className="size-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-brand-ink" />
      </span>
    </button>
  );
}
