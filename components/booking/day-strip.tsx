"use client";

import { cn } from "@/lib/utils";

export type Day = {
  dateISO: string;
  weekday: string;
  dayNumber: string;
  month: string;
  /** Closed days are dimmed and unselectable — the business isn't open. */
  closed: boolean;
};

/** Horizontally scrolling day picker for step 2. */
export function DayStrip({
  days,
  selected,
  onSelect,
}: {
  days: Day[];
  selected: string;
  onSelect: (dateISO: string) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Gün seçin"
      className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-2"
    >
      {days.map((day) => {
        const active = day.dateISO === selected;
        return (
          <button
            key={day.dateISO}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={day.closed}
            aria-label={day.closed ? `${day.weekday} — kapalı` : undefined}
            onClick={() => onSelect(day.dateISO)}
            className={cn(
              "flex w-14 shrink-0 flex-col items-center rounded-2xl border py-2.5 transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2",
              day.closed
                ? "cursor-default border-transparent opacity-35"
                : active
                  ? "border-brand text-brand-ink"
                  : "border-transparent text-foreground hover:border-border"
            )}
          >
            <span className="eyebrow text-[0.6rem] text-muted-foreground">
              {day.weekday}
            </span>
            <span className="numeral mt-0.5 text-xl leading-none">
              {day.dayNumber}
            </span>
            <span className="mt-1 text-[0.6rem] text-muted-foreground">
              {day.month}
            </span>
          </button>
        );
      })}
    </div>
  );
}
