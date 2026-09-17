"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type CardInput,
  startProSubscription,
  updateSubscriptionCard,
} from "@/lib/actions/billing";
import { isValidCardNumber } from "@/lib/billing/validators";

const EMPTY: CardInput = {
  holderName: "",
  number: "",
  expireMonth: "",
  expireYear: "",
  cvc: "",
};

/**
 * Card entry for the first Pro payment.
 *
 * iyzico has no hosted card-storage flow on a marketplace account, so the
 * number is posted to our server action and passed straight through — it is
 * never stored, never logged, and the inputs are deliberately uncontrolled by
 * anything that would persist them (no autosave, no localStorage).
 */
export function CardForm({
  mode,
  testCard,
}: {
  mode: "subscribe" | "update";
  testCard: { number: string; hint: string } | null;
}) {
  const [card, setCard] = useState<CardInput>(EMPTY);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof CardInput>(key: K, value: CardInput[K]) =>
    setCard((c) => ({ ...c, [key]: value }));

  // Same check the action runs, shown while typing rather than after a
  // failed payment. The action still validates — this is only the hint.
  const numberTyped = card.number.replace(/[\s-]/g, "");
  const numberLooksWrong =
    numberTyped.length >= 13 && !isValidCardNumber(card.number);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      const action =
        mode === "update" ? updateSubscriptionCard : startProSubscription;
      const result = await action(card);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      setCard(EMPTY);
      toast.success(
        mode === "update" ? "Kartınız güncellendi" : "Pro aboneliğiniz başladı"
      );
    });
  }

  return (
    <form onSubmit={submit} className="grid max-w-sm gap-4">
      {testCard && (
        <p className="rounded-lg border border-dashed p-3 text-muted-foreground text-xs">
          Test modu — gerçek para çekilmez. Deneme kartı:{" "}
          <span className="numeral">{testCard.number}</span> · {testCard.hint}
        </p>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor="holderName">Kart üzerindeki isim</Label>
        <Input
          id="holderName"
          autoComplete="cc-name"
          value={card.holderName}
          onChange={(e) => set("holderName", e.target.value)}
          required
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="number">Kart numarası</Label>
        <Input
          id="number"
          inputMode="numeric"
          autoComplete="cc-number"
          placeholder="5528 7900 0000 0008"
          value={card.number}
          onChange={(e) => set("number", e.target.value)}
          aria-invalid={numberLooksWrong || undefined}
          required
        />
        {numberLooksWrong && (
          <p className="text-destructive text-xs">
            Kart numarasını kontrol edin.
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="expireMonth">Ay</Label>
          <Input
            id="expireMonth"
            inputMode="numeric"
            autoComplete="cc-exp-month"
            placeholder="12"
            maxLength={2}
            value={card.expireMonth}
            onChange={(e) => set("expireMonth", e.target.value)}
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="expireYear">Yıl</Label>
          <Input
            id="expireYear"
            inputMode="numeric"
            autoComplete="cc-exp-year"
            placeholder="2030"
            maxLength={4}
            value={card.expireYear}
            onChange={(e) => set("expireYear", e.target.value)}
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cvc">CVC</Label>
          <Input
            id="cvc"
            inputMode="numeric"
            autoComplete="cc-csc"
            placeholder="123"
            maxLength={4}
            value={card.cvc}
            onChange={(e) => set("cvc", e.target.value)}
            required
          />
        </div>
      </div>

      <div>
        <Button type="submit" disabled={pending}>
          {pending
            ? "İşleniyor…"
            : mode === "update"
              ? "Kartı güncelle"
              : "₺299 öde ve Pro'ya geç"}
        </Button>
      </div>
    </form>
  );
}
