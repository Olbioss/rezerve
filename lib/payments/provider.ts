import "server-only";

/**
 * The payment surface Rezerve depends on, behind one interface.
 *
 * Two drivers implement it: `iyzico` (real API calls) and `fake` (a
 * deterministic in-app simulation). The seam exists because iyzico enables
 * Marketplace (pazaryeri) and Abonelik per merchant account — until they are
 * provisioned, submerchant creation returns error 2000 and every subscription
 * endpoint returns 100001, so nothing downstream can be exercised.
 *
 * Everything past the driver — callback verification, token-bound idempotent
 * transitions, entitlement resolution — runs identically either way. Only the
 * hosted payment page differs.
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

export type SubscriptionCheckoutInput = {
  organizationId: string;
  amountCents: number;
  customerName: string;
  customerEmail: string;
  appUrl: string;
  /** Reuse the org's existing card vault, when it has one. */
  cardUserKey?: string | null;
};

export type SubscriptionCheckoutResult = {
  organizationId: string | null;
  paid: boolean;
  /** The card the first payment stored, for charging renewals. */
  cardUserKey: string | null;
  cardToken: string | null;
  paymentRef: string | null;
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
  readonly name: "iyzico" | "fake";

  createDepositCheckout(input: DepositCheckoutInput): Promise<HostedCheckout>;
  retrieveCheckout(token: string): Promise<CheckoutResult>;

  createSubMerchant(input: SubMerchantInput): Promise<string>;
  updateSubMerchant(
    input: SubMerchantInput & { subMerchantKey: string }
  ): Promise<string>;
  retrieveSubMerchant(externalId: string): Promise<string | null>;

  /**
   * Opens a hosted checkout for the first subscription payment, which is also
   * how the card gets stored: iyzico has no card-storage-without-payment on a
   * marketplace account (/v2/ucs/init → 42205), and the alternatives in their
   * docs put the card form — and therefore the PAN — on our own server.
   *
   * Doubles as the card-update path: paying again re-stores the card.
   */
  initSubscriptionCheckout(
    input: SubscriptionCheckoutInput
  ): Promise<HostedCheckout>;
  retrieveSubscriptionCheckout(
    token: string
  ): Promise<SubscriptionCheckoutResult>;
  /** Renewals: charge the stored card with nobody present. */
  chargeStoredCard(
    input: StoredCardChargeInput
  ): Promise<StoredCardChargeResult>;
};

// Note: there is deliberately no retrieveSubscription/cancelSubscription here.
// With Abonelik unavailable, Rezerve owns the billing schedule, so
// subscription state is ours and there is nothing upstream to reconcile.
