"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cancelBookingAsCustomer } from "@/lib/actions/bookings";
import { REFUND_NOTICE_HOURS } from "@/lib/booking/cancellation-policy";

/**
 * The customer's own way out of a booking. Before anything happens the dialog
 * says what becomes of the kapora, reading the deadline when it opens; the
 * server decides again on confirm, and refuses rather than surprise anyone if
 * the deadline passed while the dialog stood open.
 */
export function CancelBooking({
  slug,
  bookingId,
  deposit,
  refundDeadlineISO,
}: {
  slug: string;
  bookingId: string;
  /** The paid kapora, formatted; null when none was paid. */
  deposit: string | null;
  refundDeadlineISO: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [refundNow, setRefundNow] = useState(false);
  const [pending, startTransition] = useTransition();

  function openDialog() {
    setRefundNow(
      deposit !== null &&
        refundDeadlineISO !== null &&
        Date.now() <= Date.parse(refundDeadlineISO)
    );
    setOpen(true);
  }

  function confirm() {
    startTransition(async () => {
      const result = await cancelBookingAsCustomer({
        slug,
        bookingId,
        expectRefund: refundNow,
      });
      if ("error" in result) {
        // The deadline passed while the dialog was open: say so, and let the
        // customer decide again with the real outcome in front of them.
        if (result.refundWindowClosed) setRefundNow(false);
        toast.error(result.error);
        return;
      }
      setOpen(false);
      toast.success(
        result.depositRefunded
          ? "Randevunuz iptal edildi; kaporanız iade edildi."
          : "Randevunuz iptal edildi."
      );
      router.refresh();
    });
  }

  const outcome =
    deposit === null
      ? "Saat başkasına açılacak."
      : refundNow
        ? `${deposit} kaporanız kartınıza iade edilecek.`
        : `Randevuya ${REFUND_NOTICE_HOURS} saatten az kaldığı için ${deposit} kapora iade edilmeyecek.`;

  return (
    <>
      <Button variant="ghost" size="sm" onClick={openDialog}>
        Randevuyu iptal et
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Randevunuz iptal edilsin mi?</DialogTitle>
            <DialogDescription>{outcome}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Vazgeç
            </Button>
            <Button variant="destructive" onClick={confirm} disabled={pending}>
              {pending ? "İptal ediliyor…" : "Evet, iptal et"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
