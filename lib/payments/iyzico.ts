import "server-only";
import Iyzipay from "iyzipay";
import { requireEnv } from "@/lib/env";

let client: Iyzipay | null = null;

function getIyzipay(): Iyzipay {
  if (!client) {
    client = new Iyzipay({
      apiKey: requireEnv("IYZICO_API_KEY"),
      secretKey: requireEnv("IYZICO_SECRET_KEY"),
      uri: process.env.IYZICO_BASE_URL ?? "https://sandbox-api.iyzipay.com",
    });
  }
  return client;
}

type IyzicoCurrency = (typeof Iyzipay.CURRENCY)[keyof typeof Iyzipay.CURRENCY];

const CURRENCY_MAP: Record<string, IyzicoCurrency> = {
  try: Iyzipay.CURRENCY.TRY,
  usd: Iyzipay.CURRENCY.USD,
  eur: Iyzipay.CURRENCY.EUR,
  gbp: Iyzipay.CURRENCY.GBP,
};

export type DepositCheckoutInput = {
  bookingId: string;
  serviceName: string;
  businessName: string;
  depositCents: number;
  currency: string;
  customerName: string;
  customerEmail: string;
  customerIp: string;
  /** Absolute origin, e.g. https://rezerve.app */
  appUrl: string;
};

export type DepositCheckout = {
  token: string;
  paymentPageUrl: string;
};

/** @types/iyzipay omits fields the live API actually returns. */
type CheckoutInitResult = {
  status: string;
  token: string;
  paymentPageUrl?: string;
  errorMessage?: string;
};

function toPrice(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Initialize an iyzico Checkout Form for a booking deposit.
 *
 * iyzico requires full buyer/address/identity fields even for virtual goods;
 * we only collect name + email, so the rest are service-level placeholders
 * (standard practice for digital services on iyzico).
 */
export function createDepositCheckout(
  input: DepositCheckoutInput
): Promise<DepositCheckout> {
  const price = toPrice(input.depositCents);
  const nameParts = input.customerName.trim().split(/\s+/);
  const surname = nameParts.length > 1 ? (nameParts.pop() as string) : ".";
  const name = nameParts.join(" ") || input.customerName;
  const address = {
    contactName: input.customerName,
    city: "Istanbul",
    country: "Turkey",
    address: input.businessName,
  };

  // @types/iyzipay wrongly reuses the direct-3DS request type here, which
  // demands paymentCard — the hosted Checkout Form collects the card itself.
  type InitParams = Parameters<Iyzipay["checkoutFormInitialize"]["create"]>[0];
  return new Promise((resolve, reject) => {
    getIyzipay().checkoutFormInitialize.create(
      {
        locale: Iyzipay.LOCALE.TR,
        conversationId: input.bookingId,
        price,
        paidPrice: price,
        currency: CURRENCY_MAP[input.currency] ?? Iyzipay.CURRENCY.TRY,
        basketId: input.bookingId,
        paymentGroup: Iyzipay.PAYMENT_GROUP.PRODUCT,
        callbackUrl: `${input.appUrl}/api/odeme/iyzico`,
        buyer: {
          id: input.bookingId,
          name,
          surname,
          gsmNumber: "+905000000000",
          email: input.customerEmail,
          identityNumber: "11111111111",
          registrationAddress: input.businessName,
          ip: input.customerIp,
          city: "Istanbul",
          country: "Turkey",
        },
        billingAddress: address,
        shippingAddress: address,
        basketItems: [
          {
            id: input.bookingId,
            name: `Kapora — ${input.serviceName}, ${input.businessName}`,
            category1: "Randevu",
            itemType: Iyzipay.BASKET_ITEM_TYPE.VIRTUAL,
            price,
          },
        ],
      } as unknown as InitParams,
      (err, rawResult) => {
        if (err) return reject(err);
        const result = rawResult as unknown as CheckoutInitResult;
        if (
          result.status !== "success" ||
          !result.token ||
          !result.paymentPageUrl
        ) {
          return reject(
            new Error(
              `iyzico checkout init failed: ${result.errorMessage ?? result.status}`
            )
          );
        }
        resolve({ token: result.token, paymentPageUrl: result.paymentPageUrl });
      }
    );
  });
}

export type CheckoutResult = {
  /** Booking id we set as conversationId at initialize time. */
  bookingId: string | null;
  paid: boolean;
  paidPrice: string | null;
};

/** Retrieve and verify a checkout form result by its callback token. */
export function retrieveCheckout(token: string): Promise<CheckoutResult> {
  return new Promise((resolve, reject) => {
    getIyzipay().checkoutForm.retrieve(
      { locale: Iyzipay.LOCALE.TR, token },
      (err, result) => {
        if (err) return reject(err);
        resolve({
          bookingId: result.conversationId ?? result.basketId ?? null,
          paid:
            result.status === "success" && result.paymentStatus === "SUCCESS",
          paidPrice: result.paidPrice != null ? String(result.paidPrice) : null,
        });
      }
    );
  });
}
