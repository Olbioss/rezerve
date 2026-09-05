"use client";

import { PlusIcon, XIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/panel/page-header";
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
      else toast.success("Çalışma saatleri kaydedildi");
    });
  }

  return (
    <div className="grid max-w-2xl gap-8">
      <PageHeader
        title="Çalışma saatleri"
        description="Saatler işletmenizin saat dilimindedir. Bölünmüş vardiyalar için birden fazla aralık ekleyebilirsiniz."
        action={
          <Button variant="brand" onClick={save} disabled={pending}>
            {pending ? "Kaydediliyor…" : "Kaydet"}
          </Button>
        }
      />

      <div className="grid">
        {WEEKDAYS.map((dayName, weekday) => {
          const dayIntervals = rules
            .map((rule, index) => ({ rule, index }))
            .filter(({ rule }) => rule.weekday === weekday);
          return (
            <div
              key={dayName}
              className="grid gap-3 border-border border-b py-4 sm:grid-cols-[9rem_1fr] sm:items-start"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="eyebrow pt-2 text-muted-foreground">
                  {dayName}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="sm:hidden"
                  onClick={() => addInterval(weekday)}
                >
                  <PlusIcon />
                  Saat ekle
                </Button>
              </div>
              <div className="grid gap-2">
                {dayIntervals.length === 0 ? (
                  <p className="py-2 font-display text-muted-foreground text-lg italic">
                    Kapalı
                  </p>
                ) : (
                  dayIntervals.map(({ rule, index }) => (
                    <div key={index} className="flex items-center gap-3">
                      <Input
                        type="time"
                        aria-label={`${dayName} başlangıç`}
                        className="numeral w-28 text-lg"
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
                        aria-label={`${dayName} bitiş`}
                        className="numeral w-28 text-lg"
                        value={minutesToTime(rule.endMinutes)}
                        onChange={(e) =>
                          updateInterval(index, {
                            endMinutes: timeToMinutes(e.target.value),
                          })
                        }
                      />
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Aralığı kaldır"
                        onClick={() => removeInterval(index)}
                      >
                        <XIcon />
                      </Button>
                    </div>
                  ))
                )}
                <div className="hidden sm:block">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => addInterval(weekday)}
                  >
                    <PlusIcon />
                    Saat ekle
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
