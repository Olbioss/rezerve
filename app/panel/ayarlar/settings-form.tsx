"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateSettings } from "@/lib/actions/business";

const timezones = Intl.supportedValuesOf("timeZone");

type Settings = {
  timezone: string;
  slotGranularityMinutes: number;
  minLeadTimeMinutes: number;
  bookingWindowDays: number;
  contactEmail: string | null;
  currency: "try";
};

export function SettingsForm({ initial }: { initial: Settings }) {
  const [settings, setSettings] = useState(initial);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      const result = await updateSettings(settings);
      if (result?.error) toast.error(result.error);
      else toast.success("Ayarlar kaydedildi");
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-6">
      <div className="grid gap-1.5">
        <Label htmlFor="timezone">Saat dilimi</Label>
        <Select
          value={settings.timezone}
          onValueChange={(value) =>
            value && setSettings((s) => ({ ...s, timezone: value }))
          }
        >
          <SelectTrigger id="timezone">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {timezones.map((tz) => (
              <SelectItem key={tz} value={tz}>
                {tz}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="granularity">Randevu aralığı (dk)</Label>
          <Input
            id="granularity"
            type="number"
            min={5}
            max={240}
            step={5}
            value={settings.slotGranularityMinutes}
            onChange={(e) =>
              setSettings((s) => ({
                ...s,
                slotGranularityMinutes: Number(e.target.value),
              }))
            }
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="leadtime">Minimum ön süre (dk)</Label>
          <Input
            id="leadtime"
            type="number"
            min={0}
            step={15}
            value={settings.minLeadTimeMinutes}
            onChange={(e) =>
              setSettings((s) => ({
                ...s,
                minLeadTimeMinutes: Number(e.target.value),
              }))
            }
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="window">Randevu penceresi (gün)</Label>
          <Input
            id="window"
            type="number"
            min={1}
            max={365}
            value={settings.bookingWindowDays}
            onChange={(e) =>
              setSettings((s) => ({
                ...s,
                bookingWindowDays: Number(e.target.value),
              }))
            }
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="currency">Para birimi</Label>
          <Input id="currency" value="₺ TRY" disabled readOnly />
          <p className="text-muted-foreground text-xs">
            iyzico Marketplace TRY ile ödeme aldığı için sabittir.
          </p>
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="contact">Bildirim e-postası (isteğe bağlı)</Label>
        <Input
          id="contact"
          type="email"
          placeholder="Varsayılan: giriş e-postanız"
          value={settings.contactEmail ?? ""}
          onChange={(e) =>
            setSettings((s) => ({
              ...s,
              contactEmail: e.target.value || null,
            }))
          }
        />
      </div>
      <Button
        type="submit"
        variant="brand"
        disabled={pending}
        className="justify-self-start"
      >
        {pending ? "Kaydediliyor…" : "Ayarları kaydet"}
      </Button>
    </form>
  );
}
