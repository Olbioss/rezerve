/**
 * Email sentences with a branch in them, kept pure so the branches are
 * tested rather than read.
 */
import { REFUND_NOTICE_HOURS } from "@/lib/booking/cancellation-policy";

type KaporaOutcome = {
  depositRefunded: boolean;
  /** Cancelled inside the last day: the business keeps the kapora. */
  depositKept: boolean;
  /** The kapora was due back, and the refund did not go through. */
  refundFailed: boolean;
};

/**
 * What a customer reads when their booking is cancelled. It points them at
 * the business, and — when the business has given one — at its phone number:
 * "contact them directly" with no way to do it was the gap this closes.
 */
export function cancelledIntro({
  customerName,
  businessName,
  businessPhone,
  depositRefunded,
}: {
  customerName: string;
  businessName: string;
  businessPhone: string | null;
  depositRefunded: boolean;
}): string {
  const refund = depositRefunded
    ? " Ödediğiniz kapora kartınıza iade edildi; bankanıza göre birkaç iş günü sürebilir."
    : "";
  const contact = businessPhone
    ? ` Bu beklenmedik bir durumsa ${businessName} ile ${businessPhone} numarasından iletişime geçebilirsiniz.`
    : ` Bu beklenmedik bir durumsa lütfen doğrudan ${businessName} ile iletişime geçin.`;
  return `Merhaba ${customerName}, randevunuz iptal edildi.${refund}${contact}`;
}

/**
 * What a customer reads after cancelling their own booking. Which of three
 * things happened to the kapora matters more than anything else in it.
 */
export function customerCancelledIntro({
  customerName,
  businessName,
  businessPhone,
  depositRefunded,
  depositKept,
  refundFailed,
}: KaporaOutcome & {
  customerName: string;
  businessName: string;
  businessPhone: string | null;
}): string {
  const kapora = depositRefunded
    ? " Ödediğiniz kapora kartınıza iade edildi; bankanıza göre birkaç iş günü sürebilir."
    : depositKept
      ? ` Randevuya ${REFUND_NOTICE_HOURS} saatten az kala iptal edildiği için kapora iade edilmedi.`
      : refundFailed
        ? ` Kaporanızın iadesi şu an tamamlanamadı; ${businessName}${
            businessPhone ? ` (${businessPhone})` : ""
          } iadeyi tamamlayacak.`
        : "";
  return `Merhaba ${customerName}, randevunuzu iptal ettiniz.${kapora} Dilerseniz yeni bir saat seçebilirsiniz.`;
}

/** What the business reads when a customer cancels: the slot, then the kapora. */
export function customerCancelledOwnerIntro({
  customerName,
  depositRefunded,
  depositKept,
  refundFailed,
}: KaporaOutcome & { customerName: string }): string {
  const kapora = depositRefunded
    ? " Kapora müşteriye iade edildi."
    : depositKept
      ? ` Randevuya ${REFUND_NOTICE_HOURS} saatten az kaldığı için kapora sizde kalıyor.`
      : refundFailed
        ? " Kapora iadesi başarısız oldu; iyzico panelinden iade etmeniz gerekebilir."
        : "";
  return `${customerName} randevusunu iptal etti; saat yeniden müsait.${kapora}`;
}
