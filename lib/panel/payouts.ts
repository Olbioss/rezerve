/**
 * Matching iyzico's settlement reporting to this organization's bookings.
 *
 * iyzico's /v2/reporting/payment/transactions is a *platform-wide* call: it
 * returns every transaction on the merchant account, across every business.
 * Worse, the rows carry no submerchant identifier — there is
 * subMerchantPayoutAmount, but nothing saying whose. So a payouts view cannot
 * filter on anything iyzico returns.
 *
 * Instead the match runs the other way. createDepositCheckout sets
 * basketId to the booking id, so a row is ours only if its basketId appears in
 * a set of bookings we loaded with eq(bookings.organizationId, …). Tenant
 * isolation is therefore enforced by our own database, and an unrecognised or
 * missing basketId can only ever drop a row, never expose one.
 *
 * Pure on purpose: no network, no database, fully testable.
 */

export type IyzicoTransaction = {
  basketId?: string | null;
  /**
   * "PAYMENT" or "REFUND". A refund carries the same basketId as the payment
   * it reverses, so without this the two are indistinguishable by booking.
   */
  transactionType?: string | null;
  paymentId?: string | number | null;
  transactionDate?: string | null;
  /** Face amount charged to the customer. */
  paidPrice?: number | null;
  iyzicoCommission?: number | null;
  iyzicoFee?: number | null;
  /** What settles to the platform's own balance. */
  merchantPayoutAmount?: number | null;
  /** What settles to the business's submerchant balance. */
  subMerchantPayoutAmount?: number | null;
  /**
   * iyzico's approval state for the split: 2 once the platform has approved
   * the item transaction and the money is released to the submerchant, 1
   * while it is still held. Surfaced in their panel as "Onay Durumu".
   */
  transactionStatus?: number | null;
};

/** A booking this organization owns. Built from an org-scoped query. */
export type OwnedBooking = {
  id: string;
  customerName: string;
  serviceName: string;
  startsAt: Date;
  /** Set once the kapora went back to the customer. Ours, not iyzico's. */
  refundedAt: Date | null;
};

export type PayoutRow = {
  bookingId: string;
  customerName: string;
  serviceName: string;
  startsAt: Date;
  /** Paid by the customer. */
  grossCents: number;
  /** iyzico's commission plus fixed fee. */
  iyzicoCutCents: number;
  /** What actually reaches the business. */
  netCents: number;
  /**
   * False while iyzico still holds the money. Showing a held kapora as if it
   * were the owner's would repeat the mistake this page already made once.
   */
  approved: boolean;
  /** The money came in and went back out; it is not the owner's. */
  refunded: boolean;
  paymentRef: string | null;
  settledOn: string | null;
};

/** iyzico's transactionStatus for an approved (released) marketplace split. */
const APPROVED_STATUS = 2;

/**
 * Refunds are reported alongside payments under the same basketId, with no
 * commission and no submerchant payout. Rendering one as income showed a
 * cancelled booking as ₺0 awaiting approval, and — because only one row per
 * booking is kept — hid the real payment behind it.
 */
function isPayment(tx: IyzicoTransaction): boolean {
  const type = tx.transactionType?.trim().toUpperCase();
  return type === undefined || type === "" || type === "PAYMENT";
}

/** iyzico reports decimals; the rest of the app is integer cents. */
function toCents(value: number | null | undefined): number {
  return Math.round((value ?? 0) * 100);
}

export function matchTransactions(
  transactions: IyzicoTransaction[],
  owned: Map<string, OwnedBooking>
): PayoutRow[] {
  const rows: PayoutRow[] = [];
  // One row per booking. A booking can appear more than once in the reporting
  // — an auth and a later capture, say, or the same day fetched twice by an
  // overlapping window — and showing it twice would double the visible total.
  const seen = new Set<string>();

  for (const tx of transactions) {
    if (!isPayment(tx)) continue;

    const basketId = tx.basketId?.trim();
    if (!basketId) continue;

    const booking = owned.get(basketId);
    // The isolation boundary: no booking of ours, no row.
    if (!booking) continue;
    if (seen.has(booking.id)) continue;
    seen.add(booking.id);

    rows.push({
      bookingId: booking.id,
      customerName: booking.customerName,
      serviceName: booking.serviceName,
      startsAt: booking.startsAt,
      grossCents: toCents(tx.paidPrice),
      iyzicoCutCents: toCents(tx.iyzicoCommission) + toCents(tx.iyzicoFee),
      // A marketplace payment settles to the submerchant; fall back to the
      // platform figure so a mis-routed payment shows up as visibly wrong
      // rather than silently as zero.
      netCents: toCents(tx.subMerchantPayoutAmount || tx.merchantPayoutAmount),
      approved: tx.transactionStatus === APPROVED_STATUS,
      // From our own record rather than iyzico's reporting: we know we
      // refunded, and a missing refund row would otherwise read as income.
      refunded: booking.refundedAt !== null,
      paymentRef: tx.paymentId != null ? String(tx.paymentId) : null,
      settledOn: tx.transactionDate ?? null,
    });
  }

  return rows.sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
}

export function totalNetCents(rows: PayoutRow[]): number {
  return rows.reduce((sum, row) => sum + row.netCents, 0);
}

/** Released to the business and not given back. */
export function releasedNetCents(rows: PayoutRow[]): number {
  return rows
    .filter((row) => row.approved && !row.refunded)
    .reduce((sum, row) => sum + row.netCents, 0);
}

/** Collected, still held by iyzico, and not given back. */
export function heldNetCents(rows: PayoutRow[]): number {
  return rows
    .filter((row) => !row.approved && !row.refunded)
    .reduce((sum, row) => sum + row.netCents, 0);
}

/** Taken and returned to the customer — income to neither side. */
export function refundedNetCents(rows: PayoutRow[]): number {
  return rows
    .filter((row) => row.refunded)
    .reduce((sum, row) => sum + row.netCents, 0);
}
