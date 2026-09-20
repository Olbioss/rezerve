import "server-only";
import Iyzipay from "iyzipay";
import { requireEnv } from "@/lib/env";
// Defined once in the provider, so this module cannot drift from the driver.
import type { CheckoutResult } from "./provider";

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

/** iyzico wants name and surname apart; we only ever collect one field. */
export function splitName(full: string): { name: string; surname: string } {
  const parts = full.trim().split(/\s+/);
  const surname = parts.length > 1 ? (parts.pop() as string) : ".";
  return { name: parts.join(" ") || full, surname };
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
  const { name, surname } = splitName(input.customerName);
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

/** Retrieve and verify a checkout form result by its callback token. */
export function retrieveCheckout(token: string): Promise<CheckoutResult> {
  return new Promise((resolve, reject) => {
    getIyzipay().checkoutForm.retrieve(
      { locale: Iyzipay.LOCALE.TR, token },
      (err, result) => {
        if (err) return reject(err);
        // paymentItems holds the item-level transaction; a kapora basket has
        // one entry, and its id is what releases the money afterwards.
        const items = (
          result as unknown as {
            paymentItems?: { paymentTransactionId?: string | number }[];
          }
        ).paymentItems;
        const transactionId = items?.[0]?.paymentTransactionId;
        resolve({
          bookingId: result.conversationId ?? result.basketId ?? null,
          paid:
            result.status === "success" && result.paymentStatus === "SUCCESS",
          paidPrice: result.paidPrice != null ? String(result.paidPrice) : null,
          paymentTransactionId:
            transactionId != null ? String(transactionId) : null,
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

// ---------------------------------------------------------------------------
// Platform subscription billing on stored cards.
//
// Abonelik is unavailable on a marketplace account, so Rezerve owns the
// billing schedule: the first payment stores a card, and renewals are
// ordinary merchant-initiated charges against the stored token.
// ---------------------------------------------------------------------------

const PLACEHOLDER_IDENTITY = "11111111111";

function billingParties(name: string, email: string, organizationId: string) {
  const { name: first, surname } = splitName(name);
  const address = {
    contactName: name,
    city: "Istanbul",
    country: "Turkey",
    address: "Rezerve",
  };
  return {
    buyer: {
      id: organizationId,
      name: first,
      surname,
      gsmNumber: "+905000000000",
      email,
      identityNumber: PLACEHOLDER_IDENTITY,
      registrationAddress: "Rezerve",
      ip: "85.34.78.112",
      city: "Istanbul",
      country: "Turkey",
    },
    billingAddress: address,
    shippingAddress: address,
  };
}

/**
 * First subscription payment, paid with a card the owner types in, stored for
 * renewals by registerCard.
 *
 * iyzico has no hosted way to store a card on a marketplace account — the
 * Checkout Form carries no paymentCard object, and the hosted vault
 * (/v2/ucs/init) is not enabled — so their integration team directs recurring
 * billing through card storage on the direct API. That means the card number
 * passes through this server on this one request: it is never logged, never
 * persisted, and only the returned cardToken/cardUserKey are kept.
 *
 * Non-3DS. A production build taking real cards would route the first payment
 * through threedsInitialize instead; renewals stay non-3DS either way, since
 * the customer is not present.
 */
export function payWithNewCard(input: {
  organizationId: string;
  amountCents: number;
  customerName: string;
  customerEmail: string;
  customerIp: string;
  card: {
    holderName: string;
    number: string;
    expireMonth: string;
    expireYear: string;
    cvc: string;
  };
  label: string;
}): Promise<{
  paid: boolean;
  cardUserKey: string | null;
  cardToken: string | null;
  paymentRef: string | null;
  errorMessage: string | null;
}> {
  const price = toPrice(input.amountCents);
  type PayParams = Parameters<Iyzipay["payment"]["create"]>[0];
  return new Promise((resolve, reject) => {
    getIyzipay().payment.create(
      {
        locale: Iyzipay.LOCALE.TR,
        conversationId: input.organizationId,
        price,
        paidPrice: price,
        currency: Iyzipay.CURRENCY.TRY,
        installment: 1,
        basketId: input.organizationId,
        paymentChannel: Iyzipay.PAYMENT_CHANNEL.WEB,
        paymentGroup: Iyzipay.PAYMENT_GROUP.SUBSCRIPTION,
        paymentCard: {
          cardHolderName: input.card.holderName,
          cardNumber: input.card.number,
          expireYear: input.card.expireYear,
          expireMonth: input.card.expireMonth,
          cvc: input.card.cvc,
          // The whole point: hand back a token we can charge next month.
          registerCard: 1,
          cardAlias: "Rezerve Pro",
        },
        ...billingParties(
          input.customerName,
          input.customerEmail,
          input.organizationId
        ),
        basketItems: [
          {
            id: "rezerve-pro",
            name: input.label,
            category1: "Abonelik",
            itemType: Iyzipay.BASKET_ITEM_TYPE.VIRTUAL,
            price,
          },
        ],
      } as unknown as PayParams,
      (err, raw) => {
        if (err) return reject(err);
        const result = raw as unknown as {
          status: string;
          paymentId?: string;
          cardUserKey?: string;
          cardToken?: string;
          errorMessage?: string;
        };
        resolve({
          paid: result.status === "success",
          cardUserKey: result.cardUserKey ?? null,
          cardToken: result.cardToken ?? null,
          paymentRef: result.paymentId ?? null,
          errorMessage: result.errorMessage ?? null,
        });
      }
    );
  });
}

/** The stored cards behind a cardUserKey, newest first. */
export function listStoredCards(
  cardUserKey: string
): Promise<{ cardToken: string }[]> {
  return new Promise((resolve, reject) => {
    getIyzipay().cardList.retrieve(
      { locale: Iyzipay.LOCALE.TR, cardUserKey },
      (err, raw) => {
        if (err) return reject(err);
        const result = raw as unknown as {
          status: string;
          cardDetails?: { cardToken: string }[];
        };
        resolve(result.status === "success" ? (result.cardDetails ?? []) : []);
      }
    );
  });
}

/** Merchant-initiated renewal charge — the customer is not present. */
export function chargeStoredCard(input: {
  organizationId: string;
  cardUserKey: string;
  cardToken: string;
  amountCents: number;
  customerName: string;
  customerEmail: string;
  label: string;
}): Promise<{
  paid: boolean;
  paymentRef: string | null;
  errorMessage: string | null;
}> {
  const price = toPrice(input.amountCents);
  type PayParams = Parameters<Iyzipay["payment"]["create"]>[0];
  return new Promise((resolve, reject) => {
    getIyzipay().payment.create(
      {
        locale: Iyzipay.LOCALE.TR,
        conversationId: `renewal_${input.organizationId}`,
        price,
        paidPrice: price,
        currency: Iyzipay.CURRENCY.TRY,
        installment: 1,
        basketId: input.organizationId,
        paymentChannel: Iyzipay.PAYMENT_CHANNEL.WEB,
        paymentGroup: Iyzipay.PAYMENT_GROUP.SUBSCRIPTION,
        paymentCard: {
          cardUserKey: input.cardUserKey,
          cardToken: input.cardToken,
        },
        ...billingParties(
          input.customerName,
          input.customerEmail,
          input.organizationId
        ),
        basketItems: [
          {
            id: "rezerve-pro",
            name: input.label,
            category1: "Abonelik",
            itemType: Iyzipay.BASKET_ITEM_TYPE.VIRTUAL,
            price,
          },
        ],
      } as unknown as PayParams,
      (err, raw) => {
        if (err) return reject(err);
        const result = raw as unknown as {
          status: string;
          paymentId?: string;
          errorMessage?: string;
        };
        resolve({
          paid: result.status === "success",
          paymentRef: result.paymentId ?? null,
          errorMessage: result.errorMessage ?? null,
        });
      }
    );
  });
}

/**
 * Settlement reporting for one calendar day, all pages.
 *
 * Platform-wide: this returns every transaction on the merchant account, and
 * the rows carry no submerchant identifier. Callers must narrow it to their
 * own bookings — see lib/panel/payouts.ts.
 */
export async function listTransactions(
  dateISO: string
): Promise<Record<string, unknown>[]> {
  const fetchPage = (page: number) =>
    new Promise<{
      status: string;
      transactions?: Record<string, unknown>[];
      totalPageCount?: number;
      errorMessage?: string;
    }>((resolve, reject) => {
      // @types/iyzipay omits the reporting resources entirely.
      const client = getIyzipay() as unknown as {
        reportingTransactions: {
          retrieve: (
            params: object,
            cb: (err: Error | null, raw: unknown) => void
          ) => void;
        };
      };
      client.reportingTransactions.retrieve(
        { locale: Iyzipay.LOCALE.TR, transactionDate: dateISO, page },
        (err, raw) => (err ? reject(err) : resolve(raw as never))
      );
    });

  const first = await fetchPage(1);
  if (first.status !== "success") {
    throw new Error(
      `iyzico transaction reporting failed: ${first.errorMessage ?? first.status}`
    );
  }

  const rows = [...(first.transactions ?? [])];
  const pages = Math.min(first.totalPageCount ?? 1, 20);
  if (pages > 1) {
    const rest = await Promise.all(
      Array.from({ length: pages - 1 }, (_, i) => fetchPage(i + 2))
    );
    for (const page of rest) rows.push(...(page.transactions ?? []));
  }
  return rows;
}

/**
 * Release a held marketplace payment to its submerchant.
 *
 * iyzico holds a marketplace payment until the platform confirms delivery, so
 * without this the kapora reaches the business's submerchant and stays there.
 * Rezerve approves as soon as the payment succeeds: a kapora is a
 * non-refundable booking deposit, so there is nothing to wait for.
 */
export function approveTransaction(
  paymentTransactionId: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    getIyzipay().approval.create(
      {
        locale: Iyzipay.LOCALE.TR,
        conversationId: paymentTransactionId,
        paymentTransactionId,
      } as never,
      (err, raw) => {
        if (err) return reject(err);
        const result = raw as unknown as {
          status: string;
          errorMessage?: string;
        };
        if (result.status !== "success") {
          return reject(
            new Error(
              `iyzico approval failed: ${result.errorMessage ?? result.status}`
            )
          );
        }
        resolve();
      }
    );
  });
}

/**
 * Return a payment to the customer.
 *
 * Refund rather than disapproval: disapproval only undoes an approval that
 * already happened and answers 5103 on a held payment, whereas a refund works
 * in both states — verified against the sandbox on a held payment and on one
 * already approved and released.
 */
export function refundTransaction(input: {
  paymentTransactionId: string;
  amountCents: number;
  customerIp: string;
}): Promise<{ refunded: boolean; errorMessage: string | null }> {
  return new Promise((resolve, reject) => {
    getIyzipay().refund.create(
      {
        locale: Iyzipay.LOCALE.TR,
        conversationId: input.paymentTransactionId,
        paymentTransactionId: input.paymentTransactionId,
        price: toPrice(input.amountCents),
        currency: Iyzipay.CURRENCY.TRY,
        ip: input.customerIp,
      } as never,
      (err, raw) => {
        if (err) return reject(err);
        const result = raw as unknown as {
          status: string;
          errorMessage?: string;
        };
        resolve({
          refunded: result.status === "success",
          errorMessage: result.errorMessage ?? null,
        });
      }
    );
  });
}
