import "server-only";

/**
 * The payment surface Rezerve depends on, behind one interface.
 *
 * One driver implements it: `iyzico`. A `fake` driver used to sit alongside
 * it, because iyzico enables Marketplace (pazaryeri) per merchant account and
 * until that was provisioned submerchant creation returned error 2000, so
 * nothing downstream could be exercised at all.
 *
 * Once it was provisioned the simulation was removed rather than kept: a
 * second path that production never exercises is exactly where the real one
 * rots unnoticed. The seam stays because it is what made the callback
 * verification and the idempotent transitions testable without it.
 */

export type DepositCheckoutInput = {
  bookingId: string;
  serviceName: string;
  businessName: string;
  depositCents: number;
  currency: string;
  customerName: string;
  customerEmail: string;
  customerIp: string;
  /** The business's submerchant — where this deposit settles. */
  subMerchantKey: string;
  /** Absolute origin, e.g. https://rezerve.app */
  appUrl: string;
};

export type HostedCheckout = {
  token: string;
  /**
   * Present for the ordinary checkout form. Undefined only if a provider
   * returns an embeddable form blob instead — see checkoutFormContent.
   */
  paymentPageUrl?: string;
  /**
   * iyzico's subscription form is documented as returning an HTML blob rather
   * than a hosted URL. That could not be confirmed against the sandbox (the
   * endpoint is not provisioned) and @types/iyzipay is known to omit fields
   * the live API returns — the ordinary form does return paymentPageUrl
   * despite the types denying it. So carry both and let the caller prefer
   * the redirect when it exists.
   */
  checkoutFormContent?: string;
};

export type CheckoutResult = {
  /** The booking id we set as conversationId at initialize time. */
  bookingId: string | null;
  paid: boolean;
  paidPrice: string | null;
  /**
   * iyzico's item-level transaction id. A marketplace payment is held until
   * the platform approves this, so without it the kapora reaches the
   * business's submerchant and never leaves.
   */
  paymentTransactionId: string | null;
};

export type SubMerchantType =
  | "personal"
  | "private_company"
  | "limited_or_joint_stock_company";

export type SubMerchantInput = {
  /** Always the organization id — deterministic, so create is recoverable. */
  subMerchantExternalId: string;
  merchantType: SubMerchantType;
  name: string;
  email: string;
  gsmNumber: string;
  address: string;
  iban: string;
  legalCompanyTitle?: string | null;
  contactName?: string | null;
  contactSurname?: string | null;
  identityNumber?: string | null;
  taxNumber?: string | null;
  taxOffice?: string | null;
};

export type NewCardChargeInput = {
  organizationId: string;
  amountCents: number;
  customerName: string;
  customerEmail: string;
  customerIp: string;
  label: string;
  /**
   * Typed by the owner. Passed straight to iyzico and never persisted or
   * logged — only the token it returns is kept.
   */
  card: {
    holderName: string;
    number: string;
    expireMonth: string;
    expireYear: string;
    cvc: string;
  };
};

export type NewCardChargeResult = {
  paid: boolean;
  /** The stored mandate renewals are charged against. */
  cardUserKey: string | null;
  cardToken: string | null;
  paymentRef: string | null;
  errorMessage: string | null;
};

export type StoredCardChargeInput = {
  organizationId: string;
  cardUserKey: string;
  cardToken: string;
  amountCents: number;
  customerName: string;
  customerEmail: string;
  /** Human-readable, shows on the statement/basket. */
  label: string;
};

export type StoredCardChargeResult = {
  paid: boolean;
  paymentRef: string | null;
  errorMessage: string | null;
};

export type PaymentProvider = {
  readonly name: "iyzico";

  createDepositCheckout(input: DepositCheckoutInput): Promise<HostedCheckout>;
  retrieveCheckout(token: string): Promise<CheckoutResult>;

  /**
   * Release a held marketplace payment to its submerchant — iyzico's "the
   * service was delivered" signal.
   */
  approveTransaction(paymentTransactionId: string): Promise<void>;
  /**
   * Return a payment to the customer. Works whether or not the split has been
   * approved — disapproval, by contrast, only undoes an approval that already
   * happened and refuses on a held payment.
   */
  refundTransaction(input: {
    paymentTransactionId: string;
    amountCents: number;
    customerIp: string;
  }): Promise<{ refunded: boolean; errorMessage: string | null }>;

  createSubMerchant(input: SubMerchantInput): Promise<string>;
  updateSubMerchant(
    input: SubMerchantInput & { subMerchantKey: string }
  ): Promise<string>;
  retrieveSubMerchant(externalId: string): Promise<string | null>;

  /**
   * First subscription payment, storing the card for renewals.
   *
   * Not a hosted flow: iyzico offers no way to store a card through a hosted
   * page on a marketplace account, and directs recurring billing through card
   * storage on the direct API. Doubles as the card-update path — paying again
   * replaces the mandate.
   */
  chargeNewCard(input: NewCardChargeInput): Promise<NewCardChargeResult>;
  /** Renewals: charge the stored card with nobody present. */
  chargeStoredCard(
    input: StoredCardChargeInput
  ): Promise<StoredCardChargeResult>;
};

// Note: there is deliberately no retrieveSubscription/cancelSubscription here.
// With Abonelik unavailable, Rezerve owns the billing schedule, so
// subscription state is ours and there is nothing upstream to reconcile.
