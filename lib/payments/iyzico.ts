import "server-only";
import Iyzipay from "iyzipay";
import { requireEnv } from "@/lib/env";

let client: Iyzipay | null = null;

export function getIyzipay(): Iyzipay {
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
  /**
   * The business's iyzico submerchant. Required, not optional: without it the
   * deposit settles into the *platform's* account instead of the business's,
   * so making it mandatory turns that mistake into a compile error.
   */
  subMerchantKey: string;
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
            subMerchantKey: input.subMerchantKey,
            // Equal to price: the platform takes no commission, the whole
            // kapora goes to the business.
            subMerchantPrice: price,
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

// ---------------------------------------------------------------------------
// Marketplace submerchants — where a business's kapora actually settles.
// ---------------------------------------------------------------------------

export type SubMerchantType =
  | "personal"
  | "private_company"
  | "limited_or_joint_stock_company";

const SUB_MERCHANT_TYPE_MAP: Record<SubMerchantType, string> = {
  personal: Iyzipay.SUB_MERCHANT_TYPE.PERSONAL,
  private_company: Iyzipay.SUB_MERCHANT_TYPE.PRIVATE_COMPANY,
  limited_or_joint_stock_company:
    Iyzipay.SUB_MERCHANT_TYPE.LIMITED_OR_JOINT_STOCK_COMPANY,
};

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

/**
 * @types/iyzipay declares identityNumber as required and omits taxNumber
 * entirely, but the SDK's CreateSubMerchantRequest reads taxNumber and the
 * limited-company flow sends it *instead of* identityNumber. Ours is the
 * shape the wire actually takes.
 */
type SubMerchantResult = {
  status: string;
  subMerchantKey?: string;
  errorCode?: string;
  errorMessage?: string;
};

function subMerchantBody(input: SubMerchantInput) {
  return {
    locale: Iyzipay.LOCALE.TR,
    conversationId: input.subMerchantExternalId,
    subMerchantExternalId: input.subMerchantExternalId,
    subMerchantType: SUB_MERCHANT_TYPE_MAP[input.merchantType],
    address: input.address,
    name: input.name,
    email: input.email,
    gsmNumber: input.gsmNumber,
    iban: input.iban,
    currency: Iyzipay.CURRENCY.TRY,
    ...(input.legalCompanyTitle
      ? { legalCompanyTitle: input.legalCompanyTitle }
      : {}),
    ...(input.contactName ? { contactName: input.contactName } : {}),
    ...(input.contactSurname ? { contactSurname: input.contactSurname } : {}),
    ...(input.identityNumber ? { identityNumber: input.identityNumber } : {}),
    ...(input.taxNumber ? { taxNumber: input.taxNumber } : {}),
    ...(input.taxOffice ? { taxOffice: input.taxOffice } : {}),
  };
}

function unwrapKey(result: SubMerchantResult, action: string): string {
  if (result.status !== "success" || !result.subMerchantKey) {
    throw new Error(
      `iyzico ${action} failed: ${result.errorMessage ?? result.status}`
    );
  }
  return result.subMerchantKey;
}

/** Create the submerchant and return its key. */
export function createSubMerchant(input: SubMerchantInput): Promise<string> {
  return new Promise((resolve, reject) => {
    getIyzipay().subMerchant.create(
      subMerchantBody(input) as never,
      (err, raw) => {
        if (err) return reject(err);
        try {
          resolve(
            unwrapKey(raw as unknown as SubMerchantResult, "submerchant create")
          );
        } catch (e) {
          reject(e);
        }
      }
    );
  });
}

/** Update an existing submerchant in place. */
export function updateSubMerchant(
  input: SubMerchantInput & { subMerchantKey: string }
): Promise<string> {
  return new Promise((resolve, reject) => {
    getIyzipay().subMerchant.update(
      {
        ...subMerchantBody(input),
        subMerchantKey: input.subMerchantKey,
      } as never,
      (err, raw) => {
        if (err) return reject(err);
        try {
          const result = raw as unknown as SubMerchantResult;
          if (result.status !== "success") {
            throw new Error(
              `iyzico submerchant update failed: ${result.errorMessage ?? result.status}`
            );
          }
          resolve(input.subMerchantKey);
        } catch (e) {
          reject(e);
        }
      }
    );
  });
}

/**
 * Look a submerchant up by our own external id.
 *
 * This is the recovery path: subMerchant.create is not retry-safe, so if we
 * crash between iyzico accepting and us storing the key, this is how the key
 * is found again instead of the org being stranded forever.
 *
 * Returns null when iyzico has no such submerchant.
 */
export function retrieveSubMerchant(
  subMerchantExternalId: string
): Promise<string | null> {
  return new Promise((resolve, reject) => {
    getIyzipay().subMerchant.retrieve(
      {
        locale: Iyzipay.LOCALE.TR,
        conversationId: subMerchantExternalId,
        subMerchantExternalId,
      },
      (err, raw) => {
        if (err) return reject(err);
        const result = raw as unknown as SubMerchantResult;
        resolve(
          result.status === "success" && result.subMerchantKey
            ? result.subMerchantKey
            : null
        );
      }
    );
  });
}
