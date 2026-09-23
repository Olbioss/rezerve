/**
 * Turning iyzico's record of a kapora into a row on /panel/odemeler.
 *
 * The page asks iyzico about each of this organization's deposit bookings by
 * id (/v2/reporting/payment/details, keyed on the conversationId that
 * createDepositCheckout sets to the booking id) instead of listing a day of
 * platform-wide transactions and picking ours out. So tenant isolation starts
 * in our own org-scoped query — we only ever ask about our bookings — and the
 * payment is still checked to be the one we asked about before it becomes a
 * row, so a mismatched answer can only drop a row, never show someone else's.
 *
 * Pure on purpose: no network, no database, fully testable.
 */

/** One payment as /v2/reporting/payment/details returns it. */
export type IyzicoPaymentDetail = {
  paymentId?: string | number | null;
  /** Echoes the conversationId the checkout set — the booking id. */
  paymentConversationId?: string | null;
  /** 1 once paid; 2 and 3 are a failed or unfinished 3-D Secure attempt. */
  paymentStatus?: number | null;
  /** Face amount charged to the customer. */
  paidPrice?: number | null;
  iyziCommissionRateAmount?: number | null;
  iyziCommissionFee?: number | null;
  /**
   * Istanbul wall-clock time despite the trailing "Z": a payment our database
   * recorded at 10:30:50Z comes back as 13:30:57Z.
   */
  createdDate?: string | null;
  itemTransactions?: IyzicoItemTransaction[] | null;
};

/** The kapora's line in the basket — a deposit checkout carries exactly one. */
export type IyzicoItemTransaction = {
  /**
   * 2 once the platform has approved the item and the money is released to
   * the submerchant; 1 while iyzico still holds it. Surfaced in their panel as
   * "Onay Durumu". 0 and -1 are fraud review.
   */
  transactionStatus?: number | null;
  /** What settles to the business's submerchant balance. */
  subMerchantPayoutAmount?: number | null;
  /** What settles to the platform's own balance. */
  merchantPayoutAmount?: number | null;
  /** When iyzico lifts its hold on the money. Same wall-clock caveat. */
  blockageResolvedDate?: string | null;
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
  /** Istanbul wall-clock, ISO without an offset. */
  paidAt: string | null;
  /** When iyzico releases its hold. Istanbul wall-clock, ISO. */
  releasesOn: string | null;
};

const PAID_STATUS = 1;
/** iyzico's transactionStatus for an approved (released) marketplace split. */
const APPROVED_STATUS = 2;

/** iyzico reports decimals; the rest of the app is integer cents. */
function toCents(value: number | null | undefined): number {
  return Math.round((value ?? 0) * 100);
}

/** Drop the "Z" iyzico puts on what is really Istanbul local time. */
function wallClock(value: string | null | undefined): string | null {
  return value ? value.replace(/Z$/, "") : null;
}

/**
 * The row for one of our bookings, or null if iyzico holds no successful
 * payment for it — a checkout that was opened and abandoned, or failed.
 */
export function toPayoutRow(
  booking: OwnedBooking,
  payments: IyzicoPaymentDetail[]
): PayoutRow | null {
  // A retried checkout leaves its failed attempt under the same id; only the
  // successful payment is money. The id check is the isolation boundary: an
  // answer about any other conversation is dropped, never shown.
  const payment = payments.find(
    (p) =>
      p.paymentStatus === PAID_STATUS && p.paymentConversationId === booking.id
  );
  if (!payment) return null;

  const item = payment.itemTransactions?.[0];
  return {
    bookingId: booking.id,
    customerName: booking.customerName,
    serviceName: booking.serviceName,
    startsAt: booking.startsAt,
    grossCents: toCents(payment.paidPrice),
    iyzicoCutCents:
      toCents(payment.iyziCommissionRateAmount) +
      toCents(payment.iyziCommissionFee),
    // A marketplace payment settles to the submerchant; fall back to the
    // platform figure so a mis-routed payment shows up as visibly wrong rather
    // than silently as zero.
    netCents: toCents(
      item?.subMerchantPayoutAmount || item?.merchantPayoutAmount
    ),
    approved: item?.transactionStatus === APPROVED_STATUS,
    // From our own record rather than iyzico's: we know we refunded, and a
    // refund iyzico has not reflected yet would otherwise read as income.
    refunded: booking.refundedAt !== null,
    paymentRef: payment.paymentId != null ? String(payment.paymentId) : null,
    paidAt: wallClock(payment.createdDate),
    releasesOn: wallClock(item?.blockageResolvedDate),
  };
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
