"use client";

import { TZDate } from "@date-fns/tz";
import { ArrowLeftIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import { BookingSummary } from "@/components/booking/booking-summary";
import { type Day, DayStrip } from "@/components/booking/day-strip";
import {
  type BookableService,
  ServiceCard,
} from "@/components/booking/service-card";
import { SlotGrid } from "@/components/booking/slot-grid";
import { StepDots } from "@/components/booking/step-dots";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBooking } from "@/lib/actions/bookings";
import { formatMoney } from "@/lib/format";

type Props = {
  slug: string;
  timezone: string;
  bookingWindowDays: number;
  currency: string;
  services: BookableService[];
};

/** Local YYYY-MM-DD in the business timezone for `daysFromNow`. */
function businessDateISO(timezone: string, daysFromNow: number): string {
  const tz = new TZDate(Date.now() + daysFromNow * 86_400_000, timezone);
  const y = tz.getFullYear();
  const m = String(tz.getMonth() + 1).padStart(2, "0");
  const d = String(tz.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dayParts(dateISO: string, timezone: string): Day {
  const [y, m, d] = dateISO.split("-").map(Number);
  const date = new TZDate(y, m - 1, d, timezone);
  const part = (options: Intl.DateTimeFormatOptions) =>
    date.toLocaleDateString("tr-TR", { ...options, timeZone: timezone });
  return {
    dateISO,
    weekday: part({ weekday: "short" }),
    dayNumber: part({ day: "numeric" }),
    month: part({ month: "short" }),
  };
}

function formatDayLabel(dateISO: string, timezone: string): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const date = new TZDate(y, m - 1, d, timezone);
  return date.toLocaleDateString("tr-TR", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: timezone,
  });
}

function formatSlotTime(iso: string, timezone: string): string {
  return new Date(iso).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  });
}

export function BookingFlow({
  slug,
  timezone,
  bookingWindowDays,
  currency,
  services,
}: Props) {
  const [service, setService] = useState<BookableService | null>(null);
  const [dateISO, setDateISO] = useState(() => businessDateISO(timezone, 0));
  const [slots, setSlots] = useState<string[] | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("odeme") === "basarisiz") {
      toast.error(
        "Ödeme tamamlanamadı — randevunuz onaylanmadı. Dilerseniz tekrar deneyebilirsiniz."
      );
    }
  }, [searchParams]);

  const days = useMemo(
    () =>
      Array.from({ length: Math.min(bookingWindowDays, 30) }, (_, i) =>
        dayParts(businessDateISO(timezone, i), timezone)
      ),
    [timezone, bookingWindowDays]
  );

  const loadSlots = useCallback(
    async (serviceId: string, date: string) => {
      setSlots(null);
      setSelectedSlot(null);
      const res = await fetch(
        `/api/r/${slug}/slots?serviceId=${serviceId}&date=${date}`
      );
      if (!res.ok) {
        setSlots([]);
        return;
      }
      const data = (await res.json()) as { slots: string[] };
      setSlots(data.slots);
    },
    [slug]
  );

  useEffect(() => {
    if (service) loadSlots(service.id, dateISO);
  }, [service, dateISO, loadSlots]);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!service || !selectedSlot) return;
    const form = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createBooking({
        slug,
        serviceId: service.id,
        startsAt: selectedSlot,
        customerName: String(form.get("name")),
        customerEmail: String(form.get("email")),
      });
      if (result?.error) {
        toast.error(result.error);
        if (service) loadSlots(service.id, dateISO);
      }
    });
  }

  if (services.length === 0) {
    return (
      <p className="rounded-2xl border border-hair border-dashed px-6 py-10 text-center text-muted-foreground">
        <span className="block font-display text-foreground text-2xl italic">
          Henüz hizmet yok.
        </span>
        Bu işletme randevu sayfasını hazırlıyor.
      </p>
    );
  }

  // Step 1 — pick a service.
  if (!service) {
    return (
      <div className="rise">
        <StepDots current={1} />
        <div className="grid gap-3">
          {services.map((s) => (
            <ServiceCard
              key={s.id}
              service={s}
              currency={currency}
              onSelect={() => setService(s)}
            />
          ))}
        </div>
        <p className="mt-6 text-center text-muted-foreground text-xs">
          Kapora istenen hizmetlerde ödeme iyzico güvencesiyle alınır.
        </p>
      </div>
    );
  }

  const summaryLine = `${service.durationMinutes} dk · ${formatMoney(
    service.priceCents,
    currency
  )}${
    service.depositCents
      ? ` · ${formatMoney(service.depositCents, currency)} kapora`
      : ""
  }`;

  // Steps 2 and 3 — day, slot, then details.
  return (
    <div className="grid gap-6">
      <StepDots current={selectedSlot ? 3 : 2} />

      <div className="flex items-center justify-between gap-3 rounded-2xl border border-hair px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-display text-lg leading-tight">
            {service.name}
          </p>
          <p className="eyebrow mt-1 text-muted-foreground">{summaryLine}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setService(null);
            setSelectedSlot(null);
          }}
        >
          <ArrowLeftIcon />
          Değiştir
        </Button>
      </div>

      <div className="min-w-0">
        <p className="eyebrow mb-2 text-muted-foreground">Gün</p>
        <DayStrip days={days} selected={dateISO} onSelect={setDateISO} />
      </div>

      <div>
        <p className="eyebrow mb-3 text-muted-foreground">Boş saatler</p>
        <SlotGrid
          slots={slots}
          selected={selectedSlot}
          formatTime={(iso) => formatSlotTime(iso, timezone)}
          onSelect={setSelectedSlot}
        />
      </div>

      {selectedSlot && (
        <div className="rise grid gap-5">
          <BookingSummary
            serviceName={service.name}
            when={`${formatDayLabel(dateISO, timezone)}, ${formatSlotTime(
              selectedSlot,
              timezone
            )}`}
            durationMinutes={service.durationMinutes}
            priceCents={service.priceCents}
            depositCents={service.depositCents}
            currency={currency}
          />
          <form onSubmit={submit} className="grid gap-5">
            <div className="grid gap-1.5">
              <Label htmlFor="name">Adınız</Label>
              <Input id="name" name="name" required minLength={2} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="email">E-posta</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <Button
              type="submit"
              variant="brand"
              size="lg"
              disabled={pending}
              className="w-full"
            >
              {pending
                ? "Randevu alınıyor…"
                : service.depositCents
                  ? `${formatMoney(service.depositCents, currency)} kapora öde ve randevu al`
                  : "Randevuyu onayla"}
            </Button>
            <p className="text-center text-muted-foreground text-xs">
              {service.depositCents
                ? "Saat 30 dakika sizin için tutulur."
                : "Üyelik gerekmez."}
            </p>
          </form>
        </div>
      )}
    </div>
  );
}
