"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Time chips for one day. `slots === null` means still loading. */
export function SlotGrid({
  slots,
  selected,
  formatTime,
  onSelect,
}: {
  slots: string[] | null;
  selected: string | null;
  formatTime: (iso: string) => string;
  onSelect: (iso: string) => void;
}) {
  if (slots === null) {
    return (
      <div className="grid grid-cols-3 gap-2.5">
        {Array.from({ length: 9 }, (_, i) => (
          <Skeleton key={i} className="h-11" />
        ))}
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <p className="rounded-2xl border border-hair border-dashed px-6 py-8 text-center text-muted-foreground text-sm">
        <span className="block font-display text-foreground text-xl">
          Bu günde boş saat yok.
        </span>
        Başka bir gün seçin.
      </p>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label="Saat seçin"
      className="grid grid-cols-3 gap-2.5"
    >
      {slots.map((slot) => {
        const active = slot === selected;
        return (
          <button
            key={slot}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onSelect(slot)}
            className={cn(
              "numeral h-11 rounded-full border text-lg transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2",
              active
                ? "border-brand bg-brand font-medium text-brand-foreground"
                : "border-hair text-foreground hover:border-brand hover:text-brand-ink"
            )}
          >
            {formatTime(slot)}
          </button>
        );
      })}
    </div>
  );
}
