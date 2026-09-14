/**
 * Creates the iyzico submerchant the demo business collects kapora into, and
 * prints its key for DEMO_SUBMERCHANT_KEY in .env.
 *
 * Separate from seed:demo, and deliberately dependency-free: the iyzico SDK
 * never calls back under Bun's runtime (it uses postman-request), so anything
 * touching iyzico has to run under Node — and Node cannot resolve this
 * project's "@/" import alias, so this script imports nothing from it.
 *
 * Idempotent: subMerchantExternalId is the demo organization id, so re-running
 * recovers the existing key rather than creating a second submerchant.
 *
 *   node scripts/create-demo-submerchant.ts
 */
import "dotenv/config";
import Iyzipay from "iyzipay";

const DEMO_ORG_ID = "org_rezerve_demo";

const iyzipay = new Iyzipay({
  apiKey: process.env.IYZICO_API_KEY ?? "",
  secretKey: process.env.IYZICO_SECRET_KEY ?? "",
  uri: process.env.IYZICO_BASE_URL ?? "https://sandbox-api.iyzipay.com",
});

type Result = {
  status: string;
  subMerchantKey?: string;
  errorCode?: string;
  errorMessage?: string;
};

function call(resource: "create" | "retrieve", body: object): Promise<Result> {
  return new Promise((resolve, reject) => {
    iyzipay.subMerchant[resource](body as never, (err: Error, res: unknown) =>
      err ? reject(err) : resolve(res as Result)
    );
  });
}

async function main() {
  if (!process.env.IYZICO_API_KEY || !process.env.IYZICO_SECRET_KEY) {
    throw new Error("IYZICO_API_KEY and IYZICO_SECRET_KEY must be set.");
  }

  const existing = await call("retrieve", {
    locale: "tr",
    conversationId: DEMO_ORG_ID,
    subMerchantExternalId: DEMO_ORG_ID,
  });
  if (existing.status === "success" && existing.subMerchantKey) {
    console.log("\nSubmerchant already exists.\n");
    console.log(`DEMO_SUBMERCHANT_KEY=${existing.subMerchantKey}\n`);
    return;
  }

  const created = await call("create", {
    locale: "tr",
    conversationId: DEMO_ORG_ID,
    subMerchantExternalId: DEMO_ORG_ID,
    subMerchantType: Iyzipay.SUB_MERCHANT_TYPE.PERSONAL,
    address: "Merdivenköy Mah. Bora Sok. No:1, Kadıköy/İstanbul",
    contactName: "Demo",
    contactSurname: "Salon",
    email: "demo@rezerve.app",
    gsmNumber: "+905350000000",
    name: "Rezerve Demo Salon",
    iban: "TR180006200119000006672315",
    // Checksum-valid; iyzico's own sample TCKN is not.
    identityNumber: "10000000146",
    currency: Iyzipay.CURRENCY.TRY,
  });

  if (created.status !== "success" || !created.subMerchantKey) {
    const hint =
      created.errorCode === "2000"
        ? "\n\nPazaryeri (Marketplace) is not enabled on this iyzico account — ask iyzico to enable it."
        : "";
    throw new Error(
      `subMerchant.create failed: ${created.errorMessage ?? created.status}${hint}`
    );
  }

  console.log("\nSubmerchant created. Add this to .env:\n");
  console.log(`DEMO_SUBMERCHANT_KEY=${created.subMerchantKey}\n`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
);
