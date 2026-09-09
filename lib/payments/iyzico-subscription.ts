import "server-only";
import Iyzipay from "iyzipay";
import { getIyzipay } from "./iyzico";
import type { ProviderSubscriptionStatus, SubscriptionState } from "./provider";

/**
 * iyzico's v2 subscription API, kept apart from the payment calls because it
 * differs in two ways that are easy to get wrong and fail silently.
 *
 * 1. Responses are envelope-wrapped as { status, systemTime, data: {...} },
 *    while @types/iyzipay models them flat.
 * 2. subscriptionCheckoutForm.retrieve reads `checkoutFormToken` (see
 *    requests/RetrieveSubscriptionCheckoutFormPathRequest.js and the SDK's own
 *    samples), but @types declares the field as `token`. Passing `token`
 *    produces a GET to /v2/subscription/checkoutform/undefined — a wrong URL,
 *    not a type error.
 */

type Envelope<T> = {
  status: string;
  errorCode?: string;
  errorMessage?: string;
  data?: T;
};

type InitData = {
  token: string;
  checkoutFormContent?: string;
  paymentPageUrl?: string;
};

type CheckoutData = {
  referenceCode?: string;
  parentReferenceCode?: string;
  customerReferenceCode?: string;
  subscriptionStatus?: string;
  conversationId?: string;
};

type SubscriptionData = {
  referenceCode?: string;
  subscriptionStatus?: string;
  trialEndDate?: string | number | null;
  endDate?: string | number | null;
};

function unwrap<T>(result: Envelope<T>, what: string): T {
  if (result.status !== "success" || !result.data) {
    throw new Error(
      `iyzico ${what} failed: ${result.errorMessage ?? result.status}`
    );
  }
  return result.data;
}

/** iyzico returns dates as epoch millis or a parseable string, depending. */
function toDate(value: string | number | null | undefined): Date | null {
  if (value == null) return null;
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeStatus(raw: string | undefined): ProviderSubscriptionStatus {
  const known: ProviderSubscriptionStatus[] = [
    "ACTIVE",
    "PENDING",
    "UNPAID",
    "EXPIRED",
    "CANCELED",
    "UPGRADED",
  ];
  const upper = (raw ?? "").toUpperCase() as ProviderSubscriptionStatus;
  return known.includes(upper) ? upper : "PENDING";
}

export function initSubscriptionCheckout(params: {
  organizationId: string;
  pricingPlanReferenceCode: string;
  callbackUrl: string;
  name: string;
  surname: string;
  email: string;
}): Promise<InitData> {
  const address = {
    contactName: `${params.name} ${params.surname}`.trim(),
    city: "Istanbul",
    country: "Turkey",
    address: "Rezerve",
  };
  return new Promise((resolve, reject) => {
    getIyzipay().subscriptionCheckoutForm.initialize(
      {
        locale: Iyzipay.LOCALE.TR,
        conversationId: params.organizationId,
        callbackUrl: params.callbackUrl,
        pricingPlanReferenceCode: params.pricingPlanReferenceCode,
        subscriptionInitialStatus: Iyzipay.SUBSCRIPTION_INITIAL_STATUS.ACTIVE,
        customer: {
          name: params.name,
          surname: params.surname,
          identityNumber: "11111111111",
          email: params.email,
          gsmNumber: "+905000000000",
          billingAddress: address,
          shippingAddress: address,
        },
      } as never,
      (err, raw) => {
        if (err) return reject(err);
        try {
          resolve(
            unwrap(raw as unknown as Envelope<InitData>, "subscription init")
          );
        } catch (e) {
          reject(e);
        }
      }
    );
  });
}

export function retrieveSubscriptionCheckout(
  checkoutFormToken: string
): Promise<CheckoutData> {
  return new Promise((resolve, reject) => {
    getIyzipay().subscriptionCheckoutForm.retrieve(
      // Not `token` — see the header comment.
      { locale: Iyzipay.LOCALE.TR, checkoutFormToken } as never,
      (err, raw) => {
        if (err) return reject(err);
        try {
          resolve(
            unwrap(
              raw as unknown as Envelope<CheckoutData>,
              "subscription checkout retrieve"
            )
          );
        } catch (e) {
          reject(e);
        }
      }
    );
  });
}

export function retrieveSubscription(
  subscriptionReferenceCode: string
): Promise<SubscriptionState> {
  return new Promise((resolve, reject) => {
    getIyzipay().subscription.retrieve(
      { locale: Iyzipay.LOCALE.TR, subscriptionReferenceCode } as never,
      (err, raw) => {
        if (err) return reject(err);
        try {
          const data = unwrap(
            raw as unknown as Envelope<SubscriptionData>,
            "subscription retrieve"
          );
          resolve({
            status: normalizeStatus(data.subscriptionStatus),
            trialEndsAt: toDate(data.trialEndDate),
            currentPeriodEndsAt: toDate(data.endDate),
          });
        } catch (e) {
          reject(e);
        }
      }
    );
  });
}

export function cancelSubscription(
  subscriptionReferenceCode: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    getIyzipay().subscription.cancel(
      { locale: Iyzipay.LOCALE.TR, subscriptionReferenceCode } as never,
      (err, raw) => {
        if (err) return reject(err);
        const result = raw as unknown as Envelope<unknown>;
        if (result.status !== "success") {
          return reject(
            new Error(
              `iyzico subscription cancel failed: ${result.errorMessage ?? result.status}`
            )
          );
        }
        resolve();
      }
    );
  });
}

export function updateSubscriptionCard(params: {
  subscriptionReferenceCode: string;
  callbackUrl: string;
}): Promise<InitData> {
  return new Promise((resolve, reject) => {
    getIyzipay().subscriptionCard.updateWithSubscriptionReferenceCode(
      {
        locale: Iyzipay.LOCALE.TR,
        subscriptionReferenceCode: params.subscriptionReferenceCode,
        callbackUrl: params.callbackUrl,
      } as never,
      (err: Error, raw: unknown) => {
        if (err) return reject(err);
        try {
          resolve(
            unwrap(raw as Envelope<InitData>, "subscription card update")
          );
        } catch (e) {
          reject(e);
        }
      }
    );
  });
}
