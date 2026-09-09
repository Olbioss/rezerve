/**
 * One-time iyzico bootstrap: creates the subscription product and the Pro
 * pricing plan, then prints their reference codes for .env.
 *
 * These are account-level objects, not per-tenant, and they are deployment
 * config exactly like the API keys — storing them in the database would mean
 * the sandbox and production databases could not be swapped.
 *
 * Idempotent: an existing product/plan with the same name is reused.
 *
 * Runs under Node, not Bun: the iyzico SDK uses postman-request, whose
 * requests never call back under Bun's runtime. The app is unaffected because
 * next.config.ts marks iyzipay as a server-external package, so it executes
 * in Node there too.
 *
 *   bun run billing:setup
 */
import "dotenv/config";
import Iyzipay from "iyzipay";
// Relative, extension-bearing imports: this script runs under Node (see the
// note below), which resolves neither the "@/" alias nor extensionless paths.
import { PRO_PRICE_CENTS, TRIAL_DAYS } from "../lib/billing/plans.ts";
import { requireEnv } from "../lib/env.ts";

const PRODUCT_NAME = "Rezerve";
const PLAN_NAME = "Rezerve Pro Aylık";

const iyzipay = new Iyzipay({
  apiKey: requireEnv("IYZICO_API_KEY"),
  secretKey: requireEnv("IYZICO_SECRET_KEY"),
  uri: process.env.IYZICO_BASE_URL ?? "https://sandbox-api.iyzipay.com",
});

type Envelope<T> = {
  status: string;
  errorCode?: string;
  errorMessage?: string;
  data?: T;
};

type Referenced = { referenceCode: string; name: string };

function call<T>(fn: string, params: object): Promise<Envelope<T>> {
  return new Promise((resolve, reject) => {
    const [resource, method] = fn.split(".");
    // biome-ignore lint/suspicious/noExplicitAny: SDK is dynamically shaped.
    (iyzipay as any)[resource][method](params, (err: Error, result: unknown) =>
      err ? reject(err) : resolve(result as Envelope<T>)
    );
  });
}

function unwrap<T>(result: Envelope<T>, what: string): T {
  if (result.status !== "success" || !result.data) {
    // 100001 "Sistem hatası" on every subscription endpoint is what iyzico
    // returns when Abonelik is simply not enabled for the merchant account.
    const hint =
      result.errorCode === "100001"
        ? "\n\nAbonelik (subscription) bu iyzico hesabında etkin görünmüyor — iyzico'dan hesabınız için Abonelik'i açmalarını isteyin."
        : "";
    throw new Error(
      `${what} failed: ${result.errorMessage ?? result.status}${hint}`
    );
  }
  return result.data;
}

async function main() {
  const list = await call<{ items: Referenced[] }>(
    "subscriptionProduct.retrieveList",
    { page: 1, count: 100 }
  );
  const existingProduct = (
    list.status === "success" ? (list.data?.items ?? []) : []
  ).find((p) => p.name === PRODUCT_NAME);

  const productRef =
    existingProduct?.referenceCode ??
    unwrap(
      await call<Referenced>("subscriptionProduct.create", {
        locale: Iyzipay.LOCALE.TR,
        name: PRODUCT_NAME,
        description: "Rezerve abonelik ürünü",
      }),
      "subscriptionProduct.create"
    ).referenceCode;

  const plans = await call<{ items: Referenced[] }>(
    "subscriptionPricingPlan.retrieveList",
    { productReferenceCode: productRef, page: 1, count: 100 }
  );
  const existingPlan = (
    plans.status === "success" ? (plans.data?.items ?? []) : []
  ).find((p) => p.name === PLAN_NAME);

  const planRef =
    existingPlan?.referenceCode ??
    unwrap(
      await call<Referenced>("subscriptionPricingPlan.create", {
        locale: Iyzipay.LOCALE.TR,
        productReferenceCode: productRef,
        name: PLAN_NAME,
        price: PRO_PRICE_CENTS / 100,
        currencyCode: Iyzipay.CURRENCY.TRY,
        paymentInterval: Iyzipay.SUBSCRIPTION_PRICING_PLAN_INTERVAL.MONTHLY,
        paymentIntervalCount: 1,
        trialPeriodDays: TRIAL_DAYS,
        planPaymentType: Iyzipay.PLAN_PAYMENT_TYPE.RECURRING,
      }),
      "subscriptionPricingPlan.create"
    ).referenceCode;

  console.log("\niyzico abonelik hazır. Bunları .env'e ekleyin:\n");
  console.log(`IYZICO_PRODUCT_REF=${productRef}`);
  console.log(`IYZICO_PRICING_PLAN_REF=${planRef}\n`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
