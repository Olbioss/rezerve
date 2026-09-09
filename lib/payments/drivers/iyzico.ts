import "server-only";
import { requireEnv } from "@/lib/env";
import {
  createDepositCheckout,
  createSubMerchant,
  retrieveCheckout,
  retrieveSubMerchant,
  updateSubMerchant,
} from "../iyzico";
import {
  cancelSubscription,
  initSubscriptionCheckout,
  retrieveSubscription,
  retrieveSubscriptionCheckout,
  updateSubscriptionCard,
} from "../iyzico-subscription";
import type { PaymentProvider } from "../provider";

/**
 * The real integration. Requires the merchant account to have Marketplace
 * (pazaryeri) and Abonelik provisioned — without them iyzico answers
 * submerchant creation with error 2000 and every subscription endpoint with
 * 100001, so the fake driver stands in until they are enabled.
 */
export const iyzicoProvider: PaymentProvider = {
  name: "iyzico",

  createDepositCheckout,
  retrieveCheckout,
  createSubMerchant,
  updateSubMerchant,
  retrieveSubMerchant,

  async initSubscriptionCheckout(input) {
    const result = await initSubscriptionCheckout({
      organizationId: input.organizationId,
      pricingPlanReferenceCode: requireEnv("IYZICO_PRICING_PLAN_REF"),
      callbackUrl: `${input.appUrl}/api/odeme/abonelik`,
      name: input.customerName.split(/\s+/)[0] ?? input.customerName,
      surname: input.customerName.split(/\s+/).slice(1).join(" ") || ".",
      email: input.customerEmail,
    });
    return {
      token: result.token,
      paymentPageUrl: result.paymentPageUrl,
      checkoutFormContent: result.checkoutFormContent,
    };
  },

  async retrieveSubscriptionCheckout(token) {
    const data = await retrieveSubscriptionCheckout(token);
    return {
      organizationId: data.conversationId ?? null,
      paid: (data.subscriptionStatus ?? "").toUpperCase() === "ACTIVE",
      subscriptionRef: data.referenceCode ?? null,
      customerRef: data.customerReferenceCode ?? null,
    };
  },

  retrieveSubscription,
  cancelSubscription,

  async updateSubscriptionCard(subscriptionRef, callbackUrl) {
    const result = await updateSubscriptionCard({
      subscriptionReferenceCode: subscriptionRef,
      callbackUrl,
    });
    return {
      token: result.token,
      paymentPageUrl: result.paymentPageUrl,
      checkoutFormContent: result.checkoutFormContent,
    };
  },
};
