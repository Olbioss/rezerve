/**
 * Email sentences with a branch in them, kept pure so the branches are
 * tested rather than read.
 */

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
