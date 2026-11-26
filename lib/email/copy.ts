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

/**
 * What a customer reads after moving their own booking, through the chat
 * assistant: they did it, so the email says so rather than blaming the
 * business.
 */
export function customerRescheduledIntro({
  customerName,
  previousText,
}: {
  customerName: string;
  previousText: string;
}): string {
  return `Merhaba ${customerName}, randevunuzu yeni bir saate taşıdınız. Önceki saat: ${previousText}.`;
}

/**
 * What a customer reads the day before. The reminder exists to cut no-shows,
 * so after the reminding it asks one thing: if you cannot come, say so, and
 * the time goes to someone else.
 */
export function reminderIntro({
  customerName,
  businessName,
  businessPhone,
}: {
  customerName: string;
  businessName: string;
  businessPhone: string | null;
}): string {
  const tell = businessPhone
    ? ` ya da ${businessName} ile ${businessPhone} numarasından iletişime geçin`
    : "";
  return `Merhaba ${customerName}, yarınki randevunuzu hatırlatmak istedik. Gelemeyecekseniz lütfen randevunuzu iptal edin${tell}; böylece saat başka birine açılır.`;
}

/**
 * A paid kapora's terms, as they stand when the email goes. Any email can
 * arrive after the refund deadline: a booking made or moved to inside the
 * next day, or a reminder for an early appointment tomorrow. Promising a
 * refund then would be wrong.
 */
export function kaporaNote({
  deadlineText,
  refundable,
}: {
  deadlineText: string;
  refundable: boolean;
}): string {
  return refundable
    ? `Randevudan ${REFUND_NOTICE_HOURS} saat öncesine kadar (${deadlineText}) iptal ederseniz kaporanız iade edilir; daha sonra iptal ederseniz kapora işletmede kalır.`
    : `Randevuya ${REFUND_NOTICE_HOURS} saatten az kaldığı için iptal ederseniz kapora işletmede kalır.`;
}

/** What the business reads when a customer moves: who, and that the old time is free. */
export function customerRescheduledOwnerIntro({
  customerName,
  previousText,
}: {
  customerName: string;
  previousText: string;
}): string {
  return `${customerName} randevusunu yeni bir saate taşıdı; önceki saat (${previousText}) yeniden müsait.`;
}
