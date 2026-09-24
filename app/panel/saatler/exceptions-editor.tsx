"use client";

import { PlusIcon, XIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addDateException,
  deleteDateException,
} from "@/lib/actions/availability";
import { minutesToTime, timeToMinutes } from "@/lib/format";
import { cn } from "@/lib/utils";

type Interval = { startMinutes: number; endMinutes: number };

export type SavedException = {
  id: string;
  startsOn: string;
  endsOn: string;
  intervals: Interval[];
  note: string | null;
};

/** "28 Eki Çar", from a local business date. */
function dayLabel(iso: string): string {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
    weekday: "short",
    // The ISO string is already the business's own date; don't shift it.
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));
}

function rangeLabel({ startsOn, endsOn }: SavedException): string {
  return startsOn === endsOn
    ? dayLabel(startsOn)
    : `${dayLabel(startsOn)} – ${dayLabel(endsOn)}`;
}

function hoursLabel(intervals: Interval[]): string {
  return intervals.length === 0
    ? "Kapalı"
    : intervals
        .map(
          (i) =>
            `${minutesToTime(i.startMinutes)}–${minutesToTime(i.endMinutes)}`
        )
        .join(", ");
}

const DEFAULT_HOURS: Interval = { startMinutes: 10 * 60, endMinutes: 14 * 60 };

export function ExceptionsEditor({
  upcoming,
  todayISO,
}: {
  upcoming: SavedException[];
  todayISO: string;
}) {
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [closed, setClosed] = useState(true);
  const [intervals, setIntervals] = useState<Interval[]>([DEFAULT_HOURS]);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  function reset() {
    setStartsOn("");
    setEndsOn("");
    setClosed(true);
    setIntervals([DEFAULT_HOURS]);
    setNote("");
  }

  function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      const result = await addDateException({
        startsOn,
        // A single day needs only the start date.
        endsOn: endsOn || startsOn,
        intervals: closed ? [] : intervals,
        note,
      });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Özel gün eklendi");
      if (result.bookingsInRange > 0) {
        toast.warning(
          `Bu tarihlerde ${result.bookingsInRange} randevunuz var. Özel gün onları iptal etmez; gerekirse Randevular'dan iptal edin.`
        );
      }
      reset();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteDateException(id);
      if (result?.error) toast.error(result.error);
      else toast.success("Özel gün kaldırıldı");
    });
  }

  const updateInterval = (index: number, patch: Partial<Interval>) =>
    setIntervals((prev) =>
      prev.map((interval, i) =>
        i === index ? { ...interval, ...patch } : interval
      )
    );

  return (
    <section className="grid max-w-2xl gap-6">
      <div>
        <h2 className="font-display text-2xl">Özel günler</h2>
        <p className="mt-1 text-muted-foreground text-sm">
          Tatiller, izinler ve farklı saatlerle çalıştığınız günler. Bu
          tarihlerde haftalık saatlerinizin yerine geçer.
        </p>
      </div>

      {upcoming.length === 0 ? (
        <p className="font-display text-lg text-muted-foreground italic">
          Yaklaşan özel gün yok.
        </p>
      ) : (
        <ul className="grid">
          {upcoming.map((exception) => (
            <li
              key={exception.id}
              className="flex items-start justify-between gap-4 border-border border-b py-3"
            >
              <div className="min-w-0">
                <p className="numeral">{rangeLabel(exception)}</p>
                <p className="text-muted-foreground text-sm">
                  {hoursLabel(exception.intervals)}
                  {exception.note ? ` · ${exception.note}` : ""}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Özel günü kaldır"
                disabled={pending}
                onClick={() => remove(exception.id)}
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={add}
        className="grid gap-5 rounded-2xl p-5 ring-1 ring-hair"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="exception-start">Başlangıç</Label>
            <Input
              id="exception-start"
              type="date"
              required
              min={todayISO}
              value={startsOn}
              onChange={(e) => setStartsOn(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="exception-end">
              Bitiş (tek gün için boş bırakın)
            </Label>
            <Input
              id="exception-end"
              type="date"
              min={startsOn || todayISO}
              value={endsOn}
              onChange={(e) => setEndsOn(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-2" role="radiogroup" aria-label="O günlerde">
          {[
            { value: true, label: "Kapalı" },
            { value: false, label: "Özel saatler" },
          ].map((option) => (
            <button
              key={option.label}
              type="button"
              role="radio"
              aria-checked={closed === option.value}
              onClick={() => setClosed(option.value)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-sm transition-colors",
                closed === option.value
                  ? "bg-brand/15 font-medium text-brand-ink"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        {!closed && (
          <div className="grid gap-2">
            {intervals.map((interval, index) => (
              <div key={index} className="flex items-center gap-3">
                <Input
                  type="time"
                  aria-label="Başlangıç saati"
                  className="numeral w-28 text-lg"
                  value={minutesToTime(interval.startMinutes)}
                  onChange={(e) =>
                    updateInterval(index, {
                      startMinutes: timeToMinutes(e.target.value),
                    })
                  }
                />
                <span className="text-muted-foreground">–</span>
                <Input
                  type="time"
                  aria-label="Bitiş saati"
                  className="numeral w-28 text-lg"
                  value={minutesToTime(interval.endMinutes)}
                  onChange={(e) =>
                    updateInterval(index, {
                      endMinutes: timeToMinutes(e.target.value),
                    })
                  }
                />
                {intervals.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Aralığı kaldır"
                    onClick={() =>
                      setIntervals((prev) => prev.filter((_, i) => i !== index))
                    }
                  >
                    <XIcon />
                  </Button>
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="justify-self-start"
              onClick={() =>
                setIntervals((prev) => [
                  ...prev,
                  { startMinutes: 15 * 60, endMinutes: 18 * 60 },
                ])
              }
            >
              <PlusIcon />
              Saat ekle
            </Button>
          </div>
        )}

        <div className="grid gap-1.5">
          <Label htmlFor="exception-note">Not (isteğe bağlı)</Label>
          <Input
            id="exception-note"
            maxLength={80}
            placeholder="Örn. Kurban Bayramı"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <Button
          type="submit"
          variant="brand"
          disabled={pending || !startsOn}
          className="justify-self-start"
        >
          {pending ? "Kaydediliyor…" : "Özel günü ekle"}
        </Button>
      </form>
    </section>
  );
}
