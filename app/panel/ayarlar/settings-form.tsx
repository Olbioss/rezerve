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
const currencies = ["usd", "eur", "gbp", "try"] as const;

type Settings = {
  timezone: string;
  slotGranularityMinutes: number;
  minLeadTimeMinutes: number;
  bookingWindowDays: number;
  contactEmail: string | null;
  currency: (typeof currencies)[number];
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
    <div className="grid max-w-xl gap-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Ayarlar</h1>
        <p className="text-muted-foreground">Randevu sayfanız için kurallar.</p>
      </div>
      <form onSubmit={submit} className="grid gap-4">
        <div className="grid gap-2">
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
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
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
          <div className="grid gap-2">
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
          <div className="grid gap-2">
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
          <div className="grid gap-2">
            <Label htmlFor="currency">Para birimi</Label>
            <Select
              value={settings.currency}
              onValueChange={(value) =>
                value &&
                setSettings((s) => ({
                  ...s,
                  currency: value as Settings["currency"],
                }))
              }
            >
              <SelectTrigger id="currency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {currencies.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c.toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-2">
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
        <Button type="submit" disabled={pending} className="justify-self-start">
          {pending ? "Kaydediliyor…" : "Ayarları kaydet"}
        </Button>
      </form>
    </div>
  );
}
