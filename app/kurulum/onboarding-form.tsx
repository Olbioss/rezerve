"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { completeOnboarding } from "@/lib/actions/business";
import { slugify } from "@/lib/slug";

const timezones = Intl.supportedValuesOf("timeZone");
const defaultTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

export function OnboardingForm() {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [timezone, setTimezone] = useState(defaultTimezone);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      const result = await completeOnboarding({ name, slug, timezone });
      if (result?.error) toast.error(result.error);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          İşletmenizi <em className="text-brand-ink">kurun</em>
        </CardTitle>
        <CardDescription>
          Bu adım, herkese açık randevu sayfanızı oluşturur.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid gap-5">
          <div className="grid gap-1.5">
            <Label htmlFor="name">İşletme adı</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
              required
              minLength={2}
              placeholder="Günnur Estetik"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="slug">Randevu sayfası adresi</Label>
            <div className="flex items-baseline gap-1">
              <span className="text-muted-foreground text-sm">/r/</span>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value);
                }}
                required
                placeholder="gunnur-estetik"
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="timezone">Saat dilimi</Label>
            <Select
              value={timezone}
              onValueChange={(value) => value && setTimezone(value)}
            >
              <SelectTrigger id="timezone">
                <SelectValue placeholder="Saat dilimi seçin" />
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
          <Button type="submit" variant="brand" disabled={pending}>
            {pending ? "Oluşturuluyor…" : "İşletmeyi oluştur"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
