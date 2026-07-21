"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveAvailability } from "@/lib/actions/availability";
import { minutesToTime, timeToMinutes, WEEKDAYS } from "@/lib/format";

type Interval = { weekday: number; startMinutes: number; endMinutes: number };

export function AvailabilityEditor({
  initialRules,
}: {
  initialRules: Interval[];
}) {
  const [rules, setRules] = useState<Interval[]>(initialRules);
  const [pending, startTransition] = useTransition();

  function addInterval(weekday: number) {
    setRules((prev) => [
      ...prev,
      { weekday, startMinutes: 9 * 60, endMinutes: 17 * 60 },
    ]);
  }

  function removeInterval(index: number) {
    setRules((prev) => prev.filter((_, i) => i !== index));
  }

  function updateInterval(index: number, patch: Partial<Interval>) {
    setRules((prev) =>
      prev.map((rule, i) => (i === index ? { ...rule, ...patch } : rule))
    );
  }

  function save() {
    startTransition(async () => {
      const result = await saveAvailability(rules);
      if (result?.error) toast.error(result.error);
      else toast.success("Availability saved");
    });
  }

  return (
    <div className="grid max-w-2xl gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">
            Weekly availability
          </h1>
          <p className="text-muted-foreground">
            Hours are in your business timezone. Add multiple intervals for
            split shifts.
          </p>
        </div>
        <Button onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>

      <div className="grid gap-4">
        {WEEKDAYS.map((dayName, weekday) => {
          const dayIntervals = rules
            .map((rule, index) => ({ rule, index }))
            .filter(({ rule }) => rule.weekday === weekday);
          return (
            <div key={dayName} className="rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">{dayName}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addInterval(weekday)}
                >
                  Add hours
                </Button>
              </div>
              {dayIntervals.length === 0 ? (
                <p className="mt-2 text-muted-foreground text-sm">Closed</p>
              ) : (
                <div className="mt-3 grid gap-2">
                  {dayIntervals.map(({ rule, index }) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        type="time"
                        className="w-32"
                        value={minutesToTime(rule.startMinutes)}
                        onChange={(e) =>
                          updateInterval(index, {
                            startMinutes: timeToMinutes(e.target.value),
                          })
                        }
                      />
                      <span className="text-muted-foreground">–</span>
                      <Input
                        type="time"
                        className="w-32"
                        value={minutesToTime(rule.endMinutes)}
                        onChange={(e) =>
                          updateInterval(index, {
                            endMinutes: timeToMinutes(e.target.value),
                          })
                        }
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeInterval(index)}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
