import { describe, expect, it } from "vitest";
import {
  type IyzicoTransaction,
  matchTransactions,
  type OwnedBooking,
  totalNetCents,
} from "./payouts";

const MINE: OwnedBooking = {
  id: "booking-mine",
  customerName: "Ayşe Yılmaz",
  serviceName: "Cilt Bakımı",
  startsAt: new Date("2026-09-14T09:00:00Z"),
};
const owned = new Map([[MINE.id, MINE]]);

function tx(overrides: Partial<IyzicoTransaction> = {}): IyzicoTransaction {
  return {
    basketId: MINE.id,
    paymentId: 37794959,
    transactionDate: "2026-09-14 12:00:40",
    paidPrice: 300,
    iyzicoCommission: 10.4351,
    iyzicoFee: 0.25,
    merchantPayoutAmount: 0,
    subMerchantPayoutAmount: 289.3149,
    ...overrides,
  };
}

describe("matchTransactions — tenant isolation", () => {
  it("drops a transaction belonging to another business", () => {
    // The whole point: iyzico's reporting call is platform-wide, so another
    // salon's kapora is in the same response.
    const rows = matchTransactions(
      [tx({ basketId: "booking-someone-elses" })],
      owned
    );
    expect(rows).toEqual([]);
  });

  it("drops rows with a missing, empty or whitespace basketId", () => {
    const junk = [
      tx({ basketId: null }),
      tx({ basketId: undefined }),
      tx({ basketId: "" }),
      tx({ basketId: "   " }),
    ];
    expect(matchTransactions(junk, owned)).toEqual([]);
  });

  it("keeps only our rows when the response mixes businesses", () => {
    const rows = matchTransactions(
      [
        tx({ basketId: "booking-someone-elses" }),
        tx(),
        tx({ basketId: "another-org-booking" }),
      ],
      owned
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].bookingId).toBe(MINE.id);
  });

  it("returns nothing when the organization owns no bookings", () => {
    expect(matchTransactions([tx()], new Map())).toEqual([]);
  });

  it("never invents a row from a payment we cannot account for", () => {
    // A subscription charge (basketId = organization id) must not surface as
    // if it were a customer's kapora.
    const rows = matchTransactions(
      [tx({ basketId: "org_rezerve_demo" })],
      owned
    );
    expect(rows).toEqual([]);
  });
});

describe("matchTransactions — the figures", () => {
  it("converts iyzico's decimals to integer cents", () => {
    const [row] = matchTransactions([tx()], owned);
    expect(row.grossCents).toBe(30_000);
    // 10.4351 → 1044 (rounded), plus the 0.25 fixed fee → 25.
    expect(row.iyzicoCutCents).toBe(1044 + 25);
    expect(row.netCents).toBe(28_931);
    expect(row.paymentRef).toBe("37794959");
  });

  it("prefers the submerchant payout — that is the business's money", () => {
    const [row] = matchTransactions(
      [tx({ subMerchantPayoutAmount: 289.31, merchantPayoutAmount: 999 })],
      owned
    );
    expect(row.netCents).toBe(28_931);
  });

  it("falls back to the platform figure so a misroute is visible", () => {
    // subMerchantPayoutAmount of 0 means the split did not happen — showing
    // the platform amount makes that obvious instead of rendering ₺0.
    const [row] = matchTransactions(
      [tx({ subMerchantPayoutAmount: 0, merchantPayoutAmount: 289.31 })],
      owned
    );
    expect(row.netCents).toBe(28_931);
  });

  it("tolerates absent amounts rather than producing NaN", () => {
    const [row] = matchTransactions(
      [
        tx({
          paidPrice: null,
          iyzicoCommission: null,
          iyzicoFee: null,
          subMerchantPayoutAmount: null,
          merchantPayoutAmount: null,
        }),
      ],
      owned
    );
    expect(row.grossCents).toBe(0);
    expect(row.iyzicoCutCents).toBe(0);
    expect(row.netCents).toBe(0);
  });

  it("sums only what it matched", () => {
    const rows = matchTransactions([tx(), tx({ basketId: "not-ours" })], owned);
    expect(totalNetCents(rows)).toBe(28_931);
  });
});
