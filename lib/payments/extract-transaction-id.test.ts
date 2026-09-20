import { describe, expect, it } from "vitest";
import { extractTransactionId } from "./iyzico";

/**
 * Recorded from a real sandbox checkoutForm.retrieve for a ₺300 kapora.
 * Trimmed, but the shape and field names are verbatim — the point of this
 * fixture is that it is not invented.
 */
const REAL_RESPONSE = {
  status: "success",
  paymentStatus: "SUCCESS",
  paymentId: "37880321",
  basketId: "c971ed66-e14b-4e92-99f9-35456b296631",
  price: 300,
  paidPrice: 300,
  itemTransactions: [
    {
      itemId: "651831b9-365b-46c9-b0f7-67aa2ceddb79",
      paymentTransactionId: "39812675",
      transactionStatus: 1,
      price: 300,
      paidPrice: 300,
      subMerchantKey: "3b654xDJSm3xHhQ1789632680657",
      subMerchantPrice: 300,
      subMerchantPayoutRate: 100,
      subMerchantPayoutAmount: 289.28,
      merchantPayoutAmount: 0,
    },
  ],
};

describe("extractTransactionId", () => {
  it("reads itemTransactions, which is what the API actually returns", () => {
    // @types/iyzipay declares paymentItems. It does not exist on the wire, and
    // trusting it meant every kapora stayed held with no id to release it by.
    expect(extractTransactionId(REAL_RESPONSE)).toBe("39812675");
  });

  it("still reads paymentItems if iyzico ever uses that name", () => {
    expect(
      extractTransactionId({
        paymentItems: [{ paymentTransactionId: "39812675" }],
      })
    ).toBe("39812675");
  });

  it("coerces a numeric id to a string", () => {
    expect(
      extractTransactionId({
        itemTransactions: [{ paymentTransactionId: 39812675 }],
      })
    ).toBe("39812675");
  });

  it("returns null rather than a bogus id when there is nothing to read", () => {
    // Null is the safe answer: approval is skipped and the booking still
    // confirms, whereas a junk id would fail against iyzico every time.
    expect(extractTransactionId({ itemTransactions: [] })).toBeNull();
    expect(extractTransactionId({ itemTransactions: [{}] })).toBeNull();
    expect(
      extractTransactionId({
        itemTransactions: [{ paymentTransactionId: null }],
      })
    ).toBeNull();
    expect(
      extractTransactionId({ itemTransactions: [{ paymentTransactionId: "" }] })
    ).toBeNull();
    expect(extractTransactionId({})).toBeNull();
    expect(extractTransactionId(null)).toBeNull();
    expect(extractTransactionId(undefined)).toBeNull();
  });
});
