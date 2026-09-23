"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updatePublicProfile } from "@/lib/actions/business";

export type PublicProfile = {
  phone: string;
  address: string;
  description: string;
};

const DESCRIPTION_MAX = 500;

export function ProfileForm({ initial }: { initial: PublicProfile }) {
  const [profile, setProfile] = useState(initial);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      const result = await updatePublicProfile(profile);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Sayfa bilgileri kaydedildi");
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-6">
      <div className="grid gap-1.5">
        <Label htmlFor="profile-phone">Telefon</Label>
        <Input
          id="profile-phone"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          maxLength={32}
          placeholder="0532 123 45 67"
          value={profile.phone}
          onChange={(e) => setProfile((s) => ({ ...s, phone: e.target.value }))}
        />
        <p className="text-muted-foreground text-xs">
          Randevu sayfanızda aranabilir olarak görünür; iptal edilen bir
          randevunun e-postasında müşteriye iletilir.
        </p>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="profile-address">Adres</Label>
        <Input
          id="profile-address"
          maxLength={200}
          placeholder="Moda Cd. No:12, Kadıköy / İstanbul"
          value={profile.address}
          onChange={(e) =>
            setProfile((s) => ({ ...s, address: e.target.value }))
          }
        />
        <p className="text-muted-foreground text-xs">
          Müşterileriniz dokunduğunda haritada açılır.
        </p>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="profile-description">Tanıtım</Label>
        <Textarea
          id="profile-description"
          maxLength={DESCRIPTION_MAX}
          placeholder="Ne yaptığınızı birkaç cümleyle anlatın."
          value={profile.description}
          onChange={(e) =>
            setProfile((s) => ({ ...s, description: e.target.value }))
          }
        />
        <p className="text-muted-foreground text-xs">
          Randevu sayfanızda adınızın altında görünür ·{" "}
          <span className="numeral">
            {profile.description.length}/{DESCRIPTION_MAX}
          </span>
        </p>
      </div>

      <Button
        type="submit"
        variant="brand"
        disabled={pending}
        className="justify-self-start"
      >
        {pending ? "Kaydediliyor…" : "Sayfa bilgilerini kaydet"}
      </Button>
    </form>
  );
}
