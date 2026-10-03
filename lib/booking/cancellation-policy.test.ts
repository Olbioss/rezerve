import { describe, expect, it } from "vitest";
import {
  customerCanCancel,
  REFUND_NOTICE_HOURS,
  refundDeadline,
  refundsDeposit,
} from "./cancellation-policy";

const startsAt = new Date("2026-10-10T09:00:00.000Z");
const hours = (n: number) => n * 3_600_000;

describe("cancellation policy", () => {
  it("gives a day's notice", () => {
    expect(REFUND_NOTICE_HOURS).toBe(24);
    expect(refundDeadline(startsAt).toISOString()).toBe(
      "2026-10-09T09:00:00.000Z"
    );
  });

  it("returns the kapora up to and including the deadline", () => {
    expect(
      refundsDeposit(startsAt, new Date(startsAt.getTime() - hours(48)))
    ).toBe(true);
    expect(
      refundsDeposit(startsAt, new Date(startsAt.getTime() - hours(24)))
    ).toBe(true);
  });

  it("keeps it from the moment the deadline has passed", () => {
    expect(
      refundsDeposit(startsAt, new Date(startsAt.getTime() - hours(24) + 1))
    ).toBe(false);
    expect(
      refundsDeposit(startsAt, new Date(startsAt.getTime() - hours(1)))
    ).toBe(false);
  });

  it("lets a customer cancel until the appointment starts", () => {
    const live = { status: "confirmed", startsAt };
    expect(customerCanCancel(live, new Date(startsAt.getTime() - 1))).toBe(
      true
    );
    expect(customerCanCancel(live, startsAt)).toBe(false);
    expect(
      customerCanCancel(live, new Date(startsAt.getTime() + hours(1)))
    ).toBe(false);
  });

  it("lets an unpaid hold be cancelled too, but not a cancelled booking", () => {
    const now = new Date(startsAt.getTime() - hours(2));
    expect(customerCanCancel({ status: "pending", startsAt }, now)).toBe(true);
    expect(customerCanCancel({ status: "cancelled", startsAt }, now)).toBe(
      false
    );
  });
});
