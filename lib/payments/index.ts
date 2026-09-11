import "server-only";
import { fakeProvider } from "./drivers/fake";
import { iyzicoProvider } from "./drivers/iyzico";
import type { PaymentProvider } from "./provider";

/**
 * Which driver backs payments — chosen per capability, because the two halves
 * of the integration are in genuinely different states.
 *
 * `deposits` covers the kapora checkout and submerchant onboarding, which are
 * verified working against a marketplace-enabled account. `billing` covers the
 * platform's own subscription revenue on stored cards.
 *
 * Both default to `fake` so a clone with no iyzico credentials still runs the
 * whole product end to end.
 */
export type Capability = "deposits" | "billing";

const ENV_VAR: Record<Capability, string> = {
  deposits: "PAYMENTS_DRIVER_DEPOSITS",
  billing: "PAYMENTS_DRIVER_BILLING",
};

export function getPaymentProvider(capability: Capability): PaymentProvider {
  return process.env[ENV_VAR[capability]] === "iyzico"
    ? iyzicoProvider
    : fakeProvider;
}

export function driverName(capability: Capability): "iyzico" | "fake" {
  return process.env[ENV_VAR[capability]] === "iyzico" ? "iyzico" : "fake";
}
