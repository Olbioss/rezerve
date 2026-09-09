"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/panel/page-header";
import { Badge } from "@/components/ui/badge";
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
import {
  type PayoutAccountInput,
  savePayoutAccount,
} from "@/lib/actions/billing";

type MerchantType = PayoutAccountInput["merchantType"];

const MERCHANT_TYPES: { value: MerchantType; label: string }[] = [
  { value: "personal", label: "Şahıs (vergi mükellefi değil)" },
  { value: "private_company", label: "Şahıs şirketi" },
  { value: "limited_or_joint_stock_company", label: "Limited / Anonim şirket" },
];

export type PayoutFormState = {
  merchantType: MerchantType;
  name: string;
  email: string;
  gsmNumber: string;
  address: string;
  iban: string;
  contactName: string;
  contactSurname: string;
  legalCompanyTitle: string;
  taxOffice: string;
  identityNumber: string;
  taxNumber: string;
};

/** Only the fields iyzico wants for the chosen type reach the action. */
function toInput(form: PayoutFormState): PayoutAccountInput {
  const common = {
    name: form.name,
    email: form.email,
    gsmNumber: form.gsmNumber,
    address: form.address,
    iban: form.iban,
  };
  if (form.merchantType === "personal") {
    return {
      merchantType: "personal",
      ...common,
      contactName: form.contactName,
      contactSurname: form.contactSurname,
      identityNumber: form.identityNumber,
    };
  }
  if (form.merchantType === "private_company") {
    return {
      merchantType: "private_company",
      ...common,
      legalCompanyTitle: form.legalCompanyTitle,
      taxOffice: form.taxOffice,
      identityNumber: form.identityNumber,
    };
  }
  return {
    merchantType: "limited_or_joint_stock_company",
    ...common,
    legalCompanyTitle: form.legalCompanyTitle,
    taxOffice: form.taxOffice,
    taxNumber: form.taxNumber,
  };
}

export function PayoutForm({
  initial,
  status,
  lastError,
  isTestMode,
  isPro,
}: {
  initial: PayoutFormState;
  status: "none" | "pending" | "active" | "rejected";
  lastError: string | null;
  isTestMode: boolean;
  isPro: boolean;
}) {
  const [form, setForm] = useState(initial);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof PayoutFormState>(
    key: K,
    value: PayoutFormState[K]
  ) => setForm((f) => ({ ...f, [key]: value }));

  const isCompany = form.merchantType !== "personal";
  const usesTaxNumber = form.merchantType === "limited_or_joint_stock_company";

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      const result = await savePayoutAccount(toInput(form));
      if (result?.error) toast.error(result.error);
      else toast.success("Ödeme hesabınız tanımlandı");
    });
  }

  return (
    <div className="grid max-w-xl gap-8">
      <PageHeader
        title="Ödeme hesabı"
        description="Kaporalar doğrudan bu hesaba geçer. Rezerve komisyon almaz."
      />

      {!isPro && (
        <div className="grid gap-2 rounded-lg border border-dashed p-4">
          <p className="font-medium text-sm">Bu adım Pro planına özel</p>
          <p className="text-muted-foreground text-sm">
            Online kapora toplamak için önce Pro'ya geçin — kaporanın tamamı
            sizin hesabınıza geçer.
          </p>
          <div>
            <Button
              render={<Link href="/panel/abonelik" />}
              nativeButton={false}
            >
              Abonelik sayfasına git
            </Button>
          </div>
        </div>
      )}

      {status === "active" && (
        <p className="text-sm text-muted-foreground">
          <Badge>Aktif</Badge> Kapora tahsilatı açık.
        </p>
      )}
      {status === "rejected" && (
        <div className="grid gap-1 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="font-medium text-sm">Ödeme hesabı doğrulanamadı</p>
          {lastError && (
            <p className="text-muted-foreground text-xs">{lastError}</p>
          )}
          <p className="text-muted-foreground text-xs">
            Bilgileri kontrol edip tekrar deneyin.
          </p>
        </div>
      )}
      {isTestMode && (
        <p className="rounded-lg border border-dashed p-3 text-muted-foreground text-xs">
          Test modu — alanlar geçerli test verileriyle dolduruldu, gerçek para
          hareketi olmaz.
        </p>
      )}

      {isPro && (
        <form onSubmit={submit} className="grid gap-6">
          <div className="grid gap-1.5">
            <Label htmlFor="merchantType">İşletme türü</Label>
            <Select
              value={form.merchantType}
              onValueChange={(value) =>
                value && set("merchantType", value as MerchantType)
              }
            >
              <SelectTrigger id="merchantType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MERCHANT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="name">İşletme adı</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              required
            />
          </div>

          {isCompany ? (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="legalCompanyTitle">Yasal ünvan</Label>
                <Input
                  id="legalCompanyTitle"
                  value={form.legalCompanyTitle}
                  onChange={(e) => set("legalCompanyTitle", e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="taxOffice">Vergi dairesi</Label>
                  <Input
                    id="taxOffice"
                    value={form.taxOffice}
                    onChange={(e) => set("taxOffice", e.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="taxId">
                    {usesTaxNumber ? "Vergi kimlik no" : "T.C. kimlik no"}
                  </Label>
                  <Input
                    id="taxId"
                    inputMode="numeric"
                    value={usesTaxNumber ? form.taxNumber : form.identityNumber}
                    onChange={(e) =>
                      set(
                        usesTaxNumber ? "taxNumber" : "identityNumber",
                        e.target.value
                      )
                    }
                    required
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="contactName">Ad</Label>
                  <Input
                    id="contactName"
                    value={form.contactName}
                    onChange={(e) => set("contactName", e.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="contactSurname">Soyad</Label>
                  <Input
                    id="contactSurname"
                    value={form.contactSurname}
                    onChange={(e) => set("contactSurname", e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="identityNumber">T.C. kimlik no</Label>
                <Input
                  id="identityNumber"
                  inputMode="numeric"
                  value={form.identityNumber}
                  onChange={(e) => set("identityNumber", e.target.value)}
                  required
                />
              </div>
            </>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="iban">IBAN</Label>
            <Input
              id="iban"
              value={form.iban}
              onChange={(e) => set("iban", e.target.value)}
              placeholder="TR.. .... .... .... .... .... .."
              required
            />
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="email">E-posta</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="gsmNumber">Cep telefonu</Label>
              <Input
                id="gsmNumber"
                inputMode="tel"
                value={form.gsmNumber}
                onChange={(e) => set("gsmNumber", e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="address">Adres</Label>
            <Input
              id="address"
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              required
            />
          </div>

          <div>
            <Button type="submit" disabled={pending}>
              {pending
                ? "Kaydediliyor…"
                : status === "active"
                  ? "Bilgileri güncelle"
                  : "Ödeme hesabını tanımla"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
