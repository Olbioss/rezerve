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
  customerName: string;
  customerEmail: string;
  appUrl: string;
};

export type SubscriptionCheckoutResult = {
  organizationId: string | null;
  paid: boolean;
  subscriptionRef: string | null;
  customerRef: string | null;
};

/** Mirrors Iyzipay.SUBSCRIPTION_STATUS; mapped to our enum by the caller. */
export type ProviderSubscriptionStatus =
  | "ACTIVE"
  | "PENDING"
  | "UNPAID"
  | "EXPIRED"
  | "CANCELED"
  | "UPGRADED";

export type SubscriptionState = {
  status: ProviderSubscriptionStatus;
  trialEndsAt: Date | null;
  currentPeriodEndsAt: Date | null;
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

  initSubscriptionCheckout(
    input: SubscriptionCheckoutInput
  ): Promise<HostedCheckout>;
  retrieveSubscriptionCheckout(
    token: string
  ): Promise<SubscriptionCheckoutResult>;
  retrieveSubscription(subscriptionRef: string): Promise<SubscriptionState>;
  cancelSubscription(subscriptionRef: string): Promise<void>;
  /** Re-collect card details after a failed renewal. */
  updateSubscriptionCard(
    subscriptionRef: string,
    callbackUrl: string
  ): Promise<HostedCheckout>;
};
