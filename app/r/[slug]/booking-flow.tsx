"use client";

import { TZDate } from "@date-fns/tz";
import { useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { createBooking } from "@/lib/actions/bookings";
import { formatMoney } from "@/lib/format";

type Service = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number;
  depositCents: number | null;
};

type Props = {
  slug: string;
  timezone: string;
  bookingWindowDays: number;
  currency: string;
  services: Service[];
};

/** Local YYYY-MM-DD in the business timezone for `daysFromNow`. */
function businessDateISO(timezone: string, daysFromNow: number): string {
  const tz = new TZDate(Date.now() + daysFromNow * 86_400_000, timezone);
  const y = tz.getFullYear();
  const m = String(tz.getMonth() + 1).padStart(2, "0");
  const d = String(tz.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDayLabel(dateISO: string, timezone: string): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const date = new TZDate(y, m - 1, d, timezone);
  return date.toLocaleDateString("tr-TR", {
    weekday: "short",
    month: "short",
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
  const [service, setService] = useState<Service | null>(null);
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
        businessDateISO(timezone, i)
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
      <p className="text-center text-muted-foreground">
        Bu işletme henüz hizmet eklememiş.
      </p>
    );
  }

  // Step 1: pick a service
  if (!service) {
    return (
      <div className="grid gap-3">
        {services.map((s) => (
          <Card
            key={s.id}
            className="cursor-pointer transition-colors hover:bg-accent"
            onClick={() => setService(s)}
          >
            <CardContent className="flex items-center justify-between py-4">
              <div>
                <p className="font-medium">{s.name}</p>
                {s.description && (
                  <p className="text-muted-foreground text-sm">
                    {s.description}
                  </p>
                )}
                <p className="mt-1 text-muted-foreground text-sm">
                  {s.durationMinutes} dk
                  {s.depositCents
                    ? ` · ${formatMoney(s.depositCents, currency)} kapora`
                    : ""}
                </p>
              </div>
              <p className="font-semibold">
                {formatMoney(s.priceCents, currency)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // Step 2 + 3: pick a day & slot, enter details
  return (
    <div className="grid gap-6">
      <button
        type="button"
        className="justify-self-start text-muted-foreground text-sm underline underline-offset-4"
        onClick={() => setService(null)}
      >
        ← Tüm hizmetler
      </button>

      <div className="flex items-center justify-between rounded-lg border p-4">
        <div>
          <p className="font-medium">{service.name}</p>
          <p className="text-muted-foreground text-sm">
            {service.durationMinutes} dk ·{" "}
            {formatMoney(service.priceCents, currency)}
            {service.depositCents
              ? ` · ${formatMoney(service.depositCents, currency)} kapora (şimdi ödenir)`
              : ""}
          </p>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {days.map((day) => (
          <Button
            key={day}
            variant={day === dateISO ? "default" : "outline"}
            size="sm"
            className="shrink-0"
            onClick={() => setDateISO(day)}
          >
            {formatDayLabel(day, timezone)}
          </Button>
        ))}
      </div>

      {slots === null ? (
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-16" />
          ))}
        </div>
      ) : slots.length === 0 ? (
        <p className="text-muted-foreground">Bu günde boş saat yok.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {slots.map((slot) => (
            <Button
              key={slot}
              variant={slot === selectedSlot ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedSlot(slot)}
            >
              {formatSlotTime(slot, timezone)}
            </Button>
          ))}
        </div>
      )}

      {selectedSlot && (
        <form onSubmit={submit} className="grid gap-4 rounded-lg border p-4">
          <p className="font-medium">
            {formatDayLabel(dateISO, timezone)},{" "}
            {formatSlotTime(selectedSlot, timezone)}
          </p>
          <div className="grid gap-2">
            <Label htmlFor="name">Adınız</Label>
            <Input id="name" name="name" required minLength={2} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">E-posta</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <Button type="submit" disabled={pending}>
            {pending
              ? "Randevu alınıyor…"
              : service.depositCents
                ? `${formatMoney(service.depositCents, currency)} kapora öde ve randevu al`
                : "Randevuyu onayla"}
          </Button>
        </form>
      )}
    </div>
  );
}
