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
import { cancelProSubscription, startTrial } from "@/lib/actions/billing";

export function CancelSubscriptionButton() {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function cancel() {
    startTransition(async () => {
      const result = await cancelProSubscription();
      if (result?.error) {
        // Leave the dialog open so the reason is visible next to the action.
        toast.error(result.error);
        return;
      }
      setOpen(false);
      toast.success("Aboneliğiniz iptal edildi");
    });
  }

  return (
    <Dialog
      open={open}
      // Ignore dismissals while the request is in flight, so the dialog can't
      // be closed out from under a cancellation that is still running.
      onOpenChange={(next) => {
        if (!pending) setOpen(next);
      }}
    >
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
            disabled={pending}
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

export function StartTrialButton({ label }: { label: string }) {
  const [pending, startTransition] = useTransition();

  function begin() {
    startTransition(async () => {
      const result = await startTrial();
      if (result?.error) toast.error(result.error);
      else toast.success("Deneme süreniz başladı");
    });
  }

  return (
    <Button onClick={begin} disabled={pending}>
      {pending ? "Başlatılıyor…" : label}
    </Button>
  );
}
