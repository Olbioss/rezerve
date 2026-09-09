import "server-only";
import { fakeProvider } from "./drivers/fake";
import { iyzicoProvider } from "./drivers/iyzico";
import type { PaymentProvider } from "./provider";

/**
 * Which driver backs payments.
 *
 * Defaults to `fake` deliberately: the real driver needs Marketplace and
 * Abonelik provisioned on the iyzico merchant account, and without them every
 * submerchant and subscription call fails. Set PAYMENTS_DRIVER=iyzico once
 * iyzico has enabled both.
 */
export function getPaymentProvider(): PaymentProvider {
  return process.env.PAYMENTS_DRIVER === "iyzico"
    ? iyzicoProvider
    : fakeProvider;
}

export const PAYMENTS_DRIVER = process.env.PAYMENTS_DRIVER ?? "fake";
