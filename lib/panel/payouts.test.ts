import { describe, expect, it } from "vitest";
import {
  heldNetCents,
  type IyzicoItemTransaction,
  type IyzicoPaymentDetail,
  type OwnedBooking,
  type PayoutRow,
  refundedNetCents,
  releasedNetCents,
  toPayoutRow,
  totalNetCents,
} from "./payouts";

const MINE: OwnedBooking = {
  id: "booking-mine",
  customerName: "Ayşe Yılmaz",
  serviceName: "Cilt Bakımı",
  startsAt: new Date("2026-09-14T09:00:00Z"),
  refundedAt: null,
};

// Shaped on what the sandbox returned for a real kapora on 20 September.
function payment(
  overrides: Partial<IyzicoPaymentDetail> = {},
  item: Partial<IyzicoItemTransaction> = {}
): IyzicoPaymentDetail {
  return {
    paymentId: 37891286,
    paymentConversationId: MINE.id,
    paymentStatus: 1,
    paidPrice: 300,
    iyziCommissionRateAmount: 10.47,
    iyziCommissionFee: 0.25,
    createdDate: "2026-09-20T11:37:08Z",
    itemTransactions: [
      {
        transactionStatus: 2,
        subMerchantPayoutAmount: 289.28,
        merchantPayoutAmount: 0,
        blockageResolvedDate: "2026-09-27T11:37:08Z",
        ...item,
      },
    ],
    ...overrides,
  };
}

function row(
  overrides: Partial<IyzicoPaymentDetail> = {},
  item: Partial<IyzicoItemTransaction> = {},
  booking: OwnedBooking = MINE
): PayoutRow {
  const result = toPayoutRow(booking, [payment(overrides, item)]);
  if (!result) throw new Error("expected a row");
  return result;
}

describe("toPayoutRow — only our own, paid booking", () => {
  it("drops a payment that answers for a different conversation", () => {
    // We only ever ask about our own bookings, but the answer is still checked:
    // a mismatch can only drop a row, never show someone else's money.
    expect(
      toPayoutRow(MINE, [
        payment({ paymentConversationId: "booking-someone-elses" }),
      ])
    ).toBeNull();
  });

  it("drops a payment with no conversation id at all", () => {
    for (const id of [null, undefined, ""]) {
      expect(
        toPayoutRow(MINE, [payment({ paymentConversationId: id })])
      ).toBeNull();
    }
  });

  it("returns nothing for a checkout that was opened and never paid", () => {
    expect(toPayoutRow(MINE, [])).toBeNull();
  });

  it("returns nothing for a failed or unfinished payment", () => {
    // 2 is a failure or a 3-D Secure attempt that never completed; 3 is one
    // still waiting on its callback. Neither is money.
    for (const status of [2, 3, null, undefined]) {
      expect(
        toPayoutRow(MINE, [payment({ paymentStatus: status })])
      ).toBeNull();
    }
  });

  it("finds the successful payment behind a failed attempt", () => {
    // A retried checkout leaves both under the same booking id.
    const result = toPayoutRow(MINE, [
      payment({ paymentStatus: 2, paymentId: 1 }),
      payment({ paymentId: 37891286 }),
    ]);
    expect(result?.paymentRef).toBe("37891286");
  });
});

describe("toPayoutRow — released or still held", () => {
  it("marks an approved split as released", () => {
    expect(row({}, { transactionStatus: 2 }).approved).toBe(true);
  });

  it("marks an unapproved split as held", () => {
    // iyzico still has this money. Presenting it as the owner's would repeat
    // the overstatement this page was already corrected for once.
    expect(row({}, { transactionStatus: 1 }).approved).toBe(false);
  });

  it("treats fraud review or an unknown status as held, never released", () => {
    for (const status of [0, -1, 3, null, undefined]) {
      expect(row({}, { transactionStatus: status }).approved).toBe(false);
    }
  });

  it("treats a payment with no item line as held, not released", () => {
    const result = toPayoutRow(MINE, [payment({ itemTransactions: [] })]);
    expect(result?.approved).toBe(false);
    expect(result?.netCents).toBe(0);
  });

  it("separates released money from held money", () => {
    const second: OwnedBooking = { ...MINE, id: "booking-two" };
    const rows = [
      row({}, { transactionStatus: 2 }),
      row(
        { paymentConversationId: second.id },
        { transactionStatus: 1 },
        second
      ),
    ];

    expect(releasedNetCents(rows)).toBe(28_928);
    expect(heldNetCents(rows)).toBe(28_928);
    expect(totalNetCents(rows)).toBe(57_856);
  });
});

describe("toPayoutRow — refunds are not income", () => {
  const refunded: OwnedBooking = {
    ...MINE,
    refundedAt: new Date("2026-09-20T08:43:27Z"),
  };

  it("marks a row refunded from our own record", () => {
    expect(row({}, {}, refunded).refunded).toBe(true);
  });

  it("counts refunded money as neither released nor held", () => {
    const rows = [row({}, {}, refunded)];
    expect(releasedNetCents(rows)).toBe(0);
    expect(heldNetCents(rows)).toBe(0);
    expect(refundedNetCents(rows)).toBe(28_928);
  });
});

describe("toPayoutRow — the figures", () => {
  it("converts iyzico's decimals to integer cents", () => {
    const result = row();
    expect(result.grossCents).toBe(30_000);
    // 10.47 commission plus the 0.25 fixed fee.
    expect(result.iyzicoCutCents).toBe(1047 + 25);
    expect(result.netCents).toBe(28_928);
    expect(result.paymentRef).toBe("37891286");
  });

  it("prefers the submerchant payout — that is the business's money", () => {
    const result = row(
      {},
      { subMerchantPayoutAmount: 289.28, merchantPayoutAmount: 999 }
    );
    expect(result.netCents).toBe(28_928);
  });

  it("falls back to the platform figure so a misroute is visible", () => {
    // A submerchant payout of 0 means the split did not happen — showing the
    // platform amount makes that obvious instead of rendering ₺0.
    const result = row(
      {},
      { subMerchantPayoutAmount: 0, merchantPayoutAmount: 289.28 }
    );
    expect(result.netCents).toBe(28_928);
  });

  it("tolerates absent amounts rather than producing NaN", () => {
    const result = row(
      {
        paidPrice: null,
        iyziCommissionRateAmount: null,
        iyziCommissionFee: null,
      },
      { subMerchantPayoutAmount: null, merchantPayoutAmount: null }
    );
    expect(result.grossCents).toBe(0);
    expect(result.iyzicoCutCents).toBe(0);
    expect(result.netCents).toBe(0);
  });

  it("keeps iyzico's times as Istanbul wall-clock, not as UTC", () => {
    // Paid at 08:37:08Z by our clock; iyzico says 11:37:08 and appends a Z.
    // Read as UTC, every time on the page would be three hours late.
    const result = row();
    expect(result.paidAt).toBe("2026-09-20T11:37:08");
    expect(result.releasesOn).toBe("2026-09-27T11:37:08");
  });

  it("leaves the dates empty when iyzico omits them", () => {
    const result = row({ createdDate: null }, { blockageResolvedDate: null });
    expect(result.paidAt).toBeNull();
    expect(result.releasesOn).toBeNull();
  });
});
