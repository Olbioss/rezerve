/**
 * Sandbox affordances, in the spirit of Stripe's test mode.
 *
 * Derived from the iyzico base URL rather than carried as its own flag, so it
 * can never claim "test mode" while pointing at production keys.
 */
export const IS_TEST_MODE =
  process.env.PAYMENTS_DRIVER !== "iyzico" ||
  (process.env.IYZICO_BASE_URL ?? "").includes("sandbox");

/**
 * iyzico sandbox test cards, surfaced at the point of payment rather than
 * buried in a README — a stranger walking the demo needs both the happy path
 * and a failure to try.
 */
export const TEST_CARDS = [
  {
    label: "Başarılı ödeme",
    number: "5528 7900 0000 0008",
    hint: "12/30 · CVC 123",
  },
  {
    label: "Yetersiz bakiye",
    number: "4111 1111 1111 1129",
    hint: "12/30 · CVC 123",
  },
  {
    label: "3D Secure",
    number: "5451 0300 0000 0000",
    hint: "12/30 · CVC 123 · şifre: 283126",
  },
] as const;

/**
 * Prefill for the payout form in test mode. iyzico's own sample TCKN is not
 * checksum-valid and its sample tax number is a 7-digit legacy value, so
 * these are checksum-valid stand-ins that pass lib/billing/validators.ts.
 * The IBAN is iyzico's sample, which is genuinely mod-97 valid.
 */
export const TEST_PAYOUT_DEFAULTS = {
  iban: "TR180006200119000006672315",
  identityNumber: "10000000146",
  taxNumber: "8720000007",
  taxOffice: "Kadıköy",
  gsmNumber: "+905350000000",
  address: "Merdivenköy Mah. Bora Sok. No:1, Kadıköy/İstanbul",
} as const;
