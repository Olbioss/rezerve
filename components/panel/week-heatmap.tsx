import type { CellState, WeekGrid } from "@/lib/panel/week-grid";
import { cn } from "@/lib/utils";

/**
 * Night = spoken for, hatched = waiting on a deposit, champagne = free.
 * Four states, no green and no red — the panel reads at a glance without
 * ever looking like an alarm.
 */
const CELL: Record<CellState, string> = {
  confirmed: "bg-primary",
  pending:
    "bg-[repeating-linear-gradient(135deg,var(--color-muted-foreground)_0_2px,transparent_2px_5px)]",
  free: "bg-brand/25",
  closed: "bg-foreground/5",
};

const LEGEND: Array<[CellState, string]> = [
  ["confirmed", "Onaylı"],
  ["pending", "Bekliyor"],
  ["free", "Boş"],
];

export function WeekHeatmap({ week }: { week: WeekGrid }) {
  return (
    <div className="rounded-2xl bg-card p-5 ring-1 ring-border">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-2xl">Bu hafta</h2>
        <span className="eyebrow text-muted-foreground">{week.rangeLabel}</span>
      </div>

      <div className="mt-4 overflow-x-auto">
        <div className="min-w-[18rem]">
          <div className="grid grid-cols-[1.75rem_repeat(7,1fr)] gap-[3px]">
            <span />
            {week.days.map((day) => (
              <span
                key={day.weekday + day.dayNumber}
                className="pb-1 text-center text-[0.6rem] text-muted-foreground"
              >
                {day.weekday}
              </span>
            ))}

            {week.hours.map((hour, hourIndex) => (
              <Row
                key={hour}
                hour={hour}
                states={week.cells[hourIndex]}
                days={week.days}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-4">
        {LEGEND.map(([state, label]) => (
          <span
            key={state}
            className="eyebrow flex items-center gap-2 text-muted-foreground"
          >
            <i
              className={cn(
                "size-2.5 rounded-[3px] ring-1 ring-border",
                CELL[state]
              )}
            />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function Row({
  hour,
  states,
  days,
}: {
  hour: number;
  states: CellState[];
  days: WeekGrid["days"];
}) {
  return (
    <>
      <span className="pt-0.5 text-[0.6rem] text-muted-foreground tabular-nums">
        {String(hour).padStart(2, "0")}
      </span>
      {states.map((state, dayIndex) => (
        <span
          key={days[dayIndex].weekday + days[dayIndex].dayNumber}
          title={`${days[dayIndex].weekday} ${String(hour).padStart(2, "0")}:00`}
          className={cn("h-5 rounded-[4px]", CELL[state])}
        />
      ))}
    </>
  );
}
