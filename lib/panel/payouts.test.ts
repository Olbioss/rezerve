import { describe, expect, it } from "vitest";
import {
  heldNetCents,
  type IyzicoTransaction,
  matchTransactions,
  type OwnedBooking,
  refundedNetCents,
  releasedNetCents,
  totalNetCents,
} from "./payouts";

const MINE: OwnedBooking = {
  id: "booking-mine",
  customerName: "Ayşe Yılmaz",
  serviceName: "Cilt Bakımı",
  startsAt: new Date("2026-09-14T09:00:00Z"),
  refundedAt: null,
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
    transactionStatus: 2,
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

describe("matchTransactions — released or still held", () => {
  it("marks an approved split as released", () => {
    const [row] = matchTransactions([tx({ transactionStatus: 2 })], owned);
    expect(row.approved).toBe(true);
  });

  it("marks an unapproved split as held", () => {
    // iyzico still has this money. Presenting it as the owner's would repeat
    // the overstatement this page was already corrected for once.
    const [row] = matchTransactions([tx({ transactionStatus: 1 })], owned);
    expect(row.approved).toBe(false);
  });

  it("treats an unknown or missing status as held, never released", () => {
    for (const status of [undefined, null, 0, 3]) {
      const [row] = matchTransactions(
        [tx({ transactionStatus: status as number })],
        owned
      );
      expect(row.approved).toBe(false);
    }
  });

  it("separates released money from held money", () => {
    const second: OwnedBooking = {
      id: "booking-two",
      customerName: "Mehmet Demir",
      serviceName: "Cilt Bakımı",
      startsAt: new Date("2026-09-15T09:00:00Z"),
      refundedAt: null,
    };
    const both = new Map([...owned, [second.id, second]]);
    const rows = matchTransactions(
      [
        tx({ transactionStatus: 2 }),
        tx({ basketId: second.id, transactionStatus: 1 }),
      ],
      both
    );

    expect(releasedNetCents(rows)).toBe(28_931);
    expect(heldNetCents(rows)).toBe(28_931);
    // The old single total silently mixed the two.
    expect(totalNetCents(rows)).toBe(57_862);
  });
});

describe("matchTransactions — refunds are not income", () => {
  // A refund is reported under the same basketId as the payment it reverses.
  const refundRow = () =>
    tx({
      transactionType: "REFUND",
      transactionStatus: undefined,
      subMerchantPayoutAmount: undefined,
      iyzicoCommission: undefined,
      iyzicoFee: undefined,
    });

  it("ignores the refund row entirely", () => {
    expect(matchTransactions([refundRow()], owned)).toEqual([]);
  });

  it("keeps the payment when a refund shares its basket", () => {
    // The refund arrives first in iyzico's ordering, and one row is kept per
    // booking — so without a type filter the refund hid the real payment and
    // the page showed ₺0 awaiting approval for a booking that had been paid.
    const rows = matchTransactions([refundRow(), tx()], owned);
    expect(rows).toHaveLength(1);
    expect(rows[0].netCents).toBe(28_931);
    expect(rows[0].approved).toBe(true);
  });

  it("marks a row refunded from our own record", () => {
    const refundedOwned = new Map([
      [MINE.id, { ...MINE, refundedAt: new Date("2026-09-20T08:43:27Z") }],
    ]);
    const [row] = matchTransactions([tx()], refundedOwned);
    expect(row.refunded).toBe(true);
  });

  it("counts refunded money as neither released nor held", () => {
    const refundedOwned = new Map([
      [MINE.id, { ...MINE, refundedAt: new Date("2026-09-20T08:43:27Z") }],
    ]);
    const rows = matchTransactions([tx()], refundedOwned);
    expect(releasedNetCents(rows)).toBe(0);
    expect(heldNetCents(rows)).toBe(0);
    expect(refundedNetCents(rows)).toBe(28_931);
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

  it("counts a booking once even if reporting lists it twice", () => {
    // An auth plus a later capture, or an overlapping day window — either
    // would otherwise double the total the owner is shown.
    const rows = matchTransactions([tx(), tx()], owned);
    expect(rows).toHaveLength(1);
    expect(totalNetCents(rows)).toBe(28_931);
  });

  it("sums only what it matched", () => {
    const rows = matchTransactions([tx(), tx({ basketId: "not-ours" })], owned);
    expect(totalNetCents(rows)).toBe(28_931);
  });
});
