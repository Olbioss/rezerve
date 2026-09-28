"use client";

import { TZDate } from "@date-fns/tz";
import { PlusIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type OwnerBookingResult,
  ownerCreateBooking,
  rescheduleBooking,
} from "@/lib/actions/owner-bookings";

export type OwnerService = {
  id: string;
  name: string;
  durationMinutes: number;
};

/** A business-local date and HH:MM for an instant. */
function localDateTime(
  instant: Date,
  timezone: string
): { dateISO: string; time: string } {
  const tz = new TZDate(instant.getTime(), timezone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    dateISO: `${tz.getFullYear()}-${pad(tz.getMonth() + 1)}-${pad(tz.getDate())}`,
    time: `${pad(tz.getHours())}:${pad(tz.getMinutes())}`,
  };
}

/**
 * Submit, and when the answer is "outside your hours", hold on to the form
 * and ask. The second press sends the same thing again, confirmed.
 */
function useOwnerSubmit(onDone: () => void) {
  const [pending, startTransition] = useTransition();
  const [needsConfirm, setNeedsConfirm] = useState(false);

  function run(
    action: (confirmed: boolean) => Promise<OwnerBookingResult>,
    confirmed: boolean,
    success: string
  ) {
    startTransition(async () => {
      const result = await action(confirmed);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      if ("outsideHours" in result) {
        setNeedsConfirm(true);
        return;
      }
      toast.success(success);
      setNeedsConfirm(false);
      onDone();
    });
  }

  return { pending, needsConfirm, setNeedsConfirm, run };
}

function OutsideHoursNotice({
  pending,
  label,
  onConfirm,
}: {
  pending: boolean;
  label: string;
  onConfirm: () => void;
}) {
  return (
    <div className="grid gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
      <p>
        Bu saat çalışma saatleriniz dışında. Müşterileriniz bu saati göremez;
        siz yine de kaydedebilirsiniz.
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={onConfirm}
        className="justify-self-start"
      >
        {label}
      </Button>
    </div>
  );
}

function WhenFields({
  idPrefix,
  dateISO,
  time,
  minDate,
  onChange,
}: {
  idPrefix: string;
  dateISO: string;
  time: string;
  minDate: string;
  onChange: (patch: { dateISO?: string; time?: string }) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-date`}>Tarih</Label>
        <Input
          id={`${idPrefix}-date`}
          type="date"
          required
          min={minDate}
          value={dateISO}
          onChange={(e) => onChange({ dateISO: e.target.value })}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-time`}>Saat</Label>
        <Input
          id={`${idPrefix}-time`}
          type="time"
          required
          className="numeral"
          value={time}
          onChange={(e) => onChange({ time: e.target.value })}
        />
      </div>
    </div>
  );
}

/** "Randevu ekle": the owner books someone in. */
export function NewBookingDialog({
  services,
  timezone,
}: {
  services: OwnerService[];
  timezone: string;
}) {
  const fresh = () => {
    // Next full hour, local to the business.
    const next = localDateTime(
      new Date(Math.ceil(Date.now() / 3_600_000) * 3_600_000),
      timezone
    );
    return {
      serviceId: services[0]?.id ?? "",
      dateISO: next.dateISO,
      time: next.time,
      customerName: "",
      customerPhone: "",
      customerEmail: "",
    };
  };

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(fresh);
  const { pending, needsConfirm, setNeedsConfirm, run } = useOwnerSubmit(() =>
    setOpen(false)
  );
  const today = localDateTime(new Date(), timezone).dateISO;

  // Any change means the "outside your hours" answer no longer applies.
  function update(patch: Partial<ReturnType<typeof fresh>>) {
    setForm((f) => ({ ...f, ...patch }));
    setNeedsConfirm(false);
  }

  const submit = (confirmed: boolean) =>
    run(
      (outsideHoursConfirmed) =>
        ownerCreateBooking({ ...form, outsideHoursConfirmed }),
      confirmed,
      "Randevu eklendi"
    );

  return (
    <>
      <Button
        variant="brand"
        size="sm"
        disabled={services.length === 0}
        title={
          services.length === 0
            ? "Önce Hizmetler'den bir hizmet ekleyin"
            : undefined
        }
        onClick={() => {
          setForm(fresh());
          setNeedsConfirm(false);
          setOpen(true);
        }}
      >
        <PlusIcon />
        Randevu ekle
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Randevu ekle</DialogTitle>
            <DialogDescription>
              Telefonla ya da yüz yüze alınan bir randevu. Kapora alınmaz;
              randevu hemen onaylanır.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(false);
            }}
            className="grid gap-5"
          >
            <div className="grid gap-1.5">
              <Label htmlFor="owner-service">Hizmet</Label>
              <Select
                items={services.map((s) => ({
                  value: s.id,
                  label: `${s.name} · ${s.durationMinutes} dk`,
                }))}
                value={form.serviceId}
                onValueChange={(value) => value && update({ serviceId: value })}
              >
                <SelectTrigger id="owner-service">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {services.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} · {s.durationMinutes} dk
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <WhenFields
              idPrefix="owner-new"
              dateISO={form.dateISO}
              time={form.time}
              minDate={today}
              onChange={update}
            />

            <div className="grid gap-1.5">
              <Label htmlFor="owner-name">Müşteri adı</Label>
              <Input
                id="owner-name"
                required
                minLength={2}
                maxLength={80}
                value={form.customerName}
                onChange={(e) => update({ customerName: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="owner-phone">Telefon</Label>
                <Input
                  id="owner-phone"
                  type="tel"
                  inputMode="tel"
                  maxLength={32}
                  placeholder="isteğe bağlı"
                  value={form.customerPhone}
                  onChange={(e) => update({ customerPhone: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="owner-email">E-posta</Label>
                <Input
                  id="owner-email"
                  type="email"
                  placeholder="isteğe bağlı"
                  value={form.customerEmail}
                  onChange={(e) => update({ customerEmail: e.target.value })}
                />
              </div>
            </div>
            <p className="-mt-2 text-muted-foreground text-xs">
              E-posta verilirse müşteriye onay gönderilir.
            </p>

            {needsConfirm ? (
              <OutsideHoursNotice
                pending={pending}
                label="Yine de ekle"
                onConfirm={() => submit(true)}
              />
            ) : (
              <Button
                type="submit"
                variant="brand"
                disabled={pending}
                className="justify-self-start"
              >
                {pending ? "Ekleniyor…" : "Randevuyu ekle"}
              </Button>
            )}
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** "Taşı": move one confirmed booking to another time. */
export function RescheduleButton({
  booking,
  timezone,
}: {
  booking: {
    id: string;
    startsAtISO: string;
    customerName: string;
    customerEmail: string | null;
    serviceName: string;
  };
  timezone: string;
}) {
  const current = () => localDateTime(new Date(booking.startsAtISO), timezone);
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState(current);
  const { pending, needsConfirm, setNeedsConfirm, run } = useOwnerSubmit(() =>
    setOpen(false)
  );
  const today = localDateTime(new Date(), timezone).dateISO;

  function update(patch: { dateISO?: string; time?: string }) {
    setWhen((w) => ({ ...w, ...patch }));
    setNeedsConfirm(false);
  }

  const submit = (confirmed: boolean) =>
    run(
      (outsideHoursConfirmed) =>
        rescheduleBooking({
          bookingId: booking.id,
          ...when,
          outsideHoursConfirmed,
        }),
      confirmed,
      "Randevu taşındı"
    );

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setWhen(current());
          setNeedsConfirm(false);
          setOpen(true);
        }}
      >
        Taşı
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Randevuyu taşı</DialogTitle>
            <DialogDescription>
              {booking.customerName} · {booking.serviceName}
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(false);
            }}
            className="grid gap-5"
          >
            <WhenFields
              idPrefix={`move-${booking.id}`}
              dateISO={when.dateISO}
              time={when.time}
              minDate={today}
              onChange={update}
            />
            <p className="text-muted-foreground text-xs">
              {booking.customerEmail
                ? "Müşteriye yeni saat e-postayla bildirilir. Süre aynı kalır."
                : "Bu müşterinin e-postası yok; yeni saati kendiniz iletin. Süre aynı kalır."}
            </p>

            {needsConfirm ? (
              <OutsideHoursNotice
                pending={pending}
                label="Yine de taşı"
                onConfirm={() => submit(true)}
              />
            ) : (
              <Button
                type="submit"
                variant="brand"
                disabled={pending}
                className="justify-self-start"
              >
                {pending ? "Taşınıyor…" : "Taşı"}
              </Button>
            )}
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
