import "server-only";
import { iyzicoProvider } from "./drivers/iyzico";
import type { PaymentProvider } from "./provider";

/**
 * The payment provider.
 *
 * There is exactly one implementation, deliberately. An in-app simulation used
 * to stand in while iyzico had neither Marketplace nor a usable recurring
 * path, but a second code path that is never exercised in production is a
 * place for the real one to rot unnoticed — so the app now always talks to
 * iyzico and requires credentials to run.
 *
 * Sandbox versus production is a separate axis: IYZICO_BASE_URL decides which
 * iyzico this reaches. Pointing at sandbox gives real API calls, real hosted
 * pages and real callbacks, with test cards and no money moving.
 *
 * Kept behind the PaymentProvider interface so tests can mock this module.
 */
export function getPaymentProvider(): PaymentProvider {
  return iyzicoProvider;
}
