"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  cancelProSubscription,
  startProSubscription,
  updateSubscriptionCard,
} from "@/lib/actions/billing";
import { IyzicoCheckoutForm } from "./iyzico-checkout-form";

/**
 * Opens a hosted checkout. Both entry points behave the same way: the action
 * usually redirects and never returns, and only falls back to embedded form
 * HTML if the provider gives that instead of a URL.
 */
export function SubscribeButton({
  label,
  action = "subscribe",
}: {
  label: string;
  action?: "subscribe" | "updateCard";
}) {
  const [pending, startTransition] = useTransition();
  const [formContent, setFormContent] = useState<string | null>(null);

  function subscribe() {
    startTransition(async () => {
      const result =
        action === "updateCard"
          ? await updateSubscriptionCard()
          : await startProSubscription();
      if (result && "formContent" in result) setFormContent(result.formContent);
      else if (result?.error) toast.error(result.error);
    });
  }

  if (formContent) return <IyzicoCheckoutForm content={formContent} />;

  return (
    <Button onClick={subscribe} disabled={pending}>
      {pending ? "Yönlendiriliyor…" : label}
    </Button>
  );
}

export function CancelSubscriptionButton() {
  const [pending, startTransition] = useTransition();

  function cancel() {
    startTransition(async () => {
      const result = await cancelProSubscription();
      if (result?.error) toast.error(result.error);
      else toast.success("Aboneliğiniz iptal edildi");
    });
  }

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" nativeButton={false} />}>
        Aboneliği iptal et
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Aboneliği iptal et</DialogTitle>
        <DialogDescription>
          Ödediğiniz dönemin sonuna kadar Pro açık kalır. Dönem bitince online
          kapora kapanır; hizmetlerinizdeki kapora tutarları silinmez.
        </DialogDescription>
        <div className="mt-4 flex justify-end gap-2">
          <DialogClose
            render={<Button variant="outline" nativeButton={false} />}
          >
            Vazgeç
          </DialogClose>
          <Button onClick={cancel} disabled={pending}>
            {pending ? "İptal ediliyor…" : "Evet, iptal et"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
