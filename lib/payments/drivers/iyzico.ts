import "server-only";
import {
  approveTransaction,
  chargeStoredCard,
  createDepositCheckout,
  createSubMerchant,
  payWithNewCard,
  retrieveCheckout,
  retrieveSubMerchant,
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
  approveTransaction,
  createSubMerchant,
  updateSubMerchant,
  retrieveSubMerchant,

  chargeNewCard: payWithNewCard,

  async chargeStoredCard(input) {
    return chargeStoredCard(input);
  },
};
