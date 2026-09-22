"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateBusinessIdentity } from "@/lib/actions/business";

export type Identity = { name: string; slug: string };

export function IdentityForm({ initial }: { initial: Identity }) {
  const [identity, setIdentity] = useState(initial);
  // What is actually stored, so the warning below compares against the live
  // address rather than whatever the page happened to load with.
  const [saved, setSaved] = useState(initial);
  const [pending, startTransition] = useTransition();

  const slugChanged = identity.slug !== saved.slug;

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      const result = await updateBusinessIdentity(identity);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("İşletme bilgileri kaydedildi");
      setSaved(identity);
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-6">
      <div className="grid gap-1.5">
        <Label htmlFor="business-name">İşletme adı</Label>
        <Input
          id="business-name"
          value={identity.name}
          maxLength={80}
          onChange={(e) => setIdentity((s) => ({ ...s, name: e.target.value }))}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="business-slug">Randevu sayfası adresi</Label>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground text-sm">/r/</span>
          <Input
            id="business-slug"
            value={identity.slug}
            maxLength={48}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) =>
              setIdentity((s) => ({
                ...s,
                slug: e.target.value.toLowerCase(),
              }))
            }
          />
        </div>
        {slugChanged ? (
          <p className="text-amber-700 text-xs dark:text-amber-500">
            Adresi değiştirirseniz <code>/r/{saved.slug}</code> bağlantısı
            çalışmayı bırakır — paylaştığınız eski bağlantılar dahil.
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">
            Küçük harf, rakam ve tek tire. Müşterilerinizin gördüğü adres.
          </p>
        )}
      </div>

      <Button
        type="submit"
        variant="brand"
        disabled={pending}
        className="justify-self-start"
      >
        {pending ? "Kaydediliyor…" : "Bilgileri kaydet"}
      </Button>
    </form>
  );
}
