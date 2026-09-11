import "server-only";
import {
  chargeStoredCard,
  createDepositCheckout,
  createSubMerchant,
  createSubscriptionCheckout,
  retrieveCheckout,
  retrieveSubMerchant,
  retrieveSubscriptionCheckoutResult,
  updateSubMerchant,
} from "../iyzico";
import type { PaymentProvider } from "../provider";

/**
 * The real integration.
 *
 * Requires Marketplace (pazaryeri) on the merchant account — verified working.
 * Note that Abonelik is *not* used and cannot be: iyzico does not offer the
 * subscription product on a marketplace account, and directs recurring billing
 * through card storage instead. Rezerve therefore owns the billing schedule
 * (see lib/billing/charge-subscription.ts).
 */
export const iyzicoProvider: PaymentProvider = {
  name: "iyzico",

  createDepositCheckout,
  retrieveCheckout,
  createSubMerchant,
  updateSubMerchant,
  retrieveSubMerchant,

  async initSubscriptionCheckout(input) {
    return createSubscriptionCheckout({
      organizationId: input.organizationId,
      amountCents: input.amountCents,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      appUrl: input.appUrl,
      cardUserKey: input.cardUserKey,
    });
  },

  retrieveSubscriptionCheckout: retrieveSubscriptionCheckoutResult,

  async chargeStoredCard(input) {
    return chargeStoredCard(input);
  },
};
