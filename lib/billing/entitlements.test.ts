import { describe, expect, it } from "vitest";
import {
  PAST_DUE_GRACE_DAYS,
  resolveEntitlements,
  type SubscriptionSnapshot,
  type SubscriptionStatus,
} from "./entitlements";

const NOW = new Date("2026-03-12T09:00:00Z");
const DAY = 86_400_000;
const at = (offsetDays: number) => new Date(NOW.getTime() + offsetDays * DAY);

function sub(
  status: SubscriptionStatus,
  overrides: Partial<SubscriptionSnapshot> = {}
): SubscriptionSnapshot {
  return {
    status,
    trialEndsAt: null,
    currentPeriodEndsAt: at(18),
    ...overrides,
  };
}

const PAID = { status: "active" } as const;

describe("resolveEntitlements — the free tier", () => {
  it("treats a missing subscription row as free", () => {
    const result = resolveEntitlements(null, null, NOW);
    expect(result).toEqual({
      plan: "free",
      onlineDeposit: false,
      reason: "free",
    });
  });

  it("treats an abandoned checkout as free, not expired", () => {
    // status 'pending' means they opened the form and never paid.
    expect(resolveEntitlements(sub("pending"), PAID, NOW).reason).toBe("free");
    expect(resolveEntitlements(sub("none"), PAID, NOW).reason).toBe("free");
  });

  it("reports a lapsed subscription as expired", () => {
    expect(resolveEntitlements(sub("expired"), PAID, NOW).reason).toBe(
      "expired"
    );
  });
});

describe("resolveEntitlements — trials", () => {
  it("entitles a trial that has not ended", () => {
    const s = sub("trialing", {
      trialEndsAt: at(1),
      currentPeriodEndsAt: null,
    });
    expect(resolveEntitlements(s, PAID, NOW)).toEqual({
      plan: "pro",
      onlineDeposit: true,
      reason: "trialing",
    });
  });

  it("drops a trial that ended yesterday", () => {
    const s = sub("trialing", {
      trialEndsAt: at(-1),
      currentPeriodEndsAt: null,
    });
    expect(resolveEntitlements(s, PAID, NOW).onlineDeposit).toBe(false);
    expect(resolveEntitlements(s, PAID, NOW).reason).toBe("expired");
  });

  it("falls back to the period end when no trial end is recorded", () => {
    const s = sub("trialing", {
      trialEndsAt: null,
      currentPeriodEndsAt: at(-1),
    });
    expect(resolveEntitlements(s, PAID, NOW).onlineDeposit).toBe(false);
  });
});

describe("resolveEntitlements — active", () => {
  it("entitles an active subscription inside its period", () => {
    expect(resolveEntitlements(sub("active"), PAID, NOW)).toEqual({
      plan: "pro",
      onlineDeposit: true,
      reason: "active",
    });
  });

  it("trusts an active status whose end date has not synced yet", () => {
    // Better to serve a paying customer than to lock them out over a null.
    const s = sub("active", { currentPeriodEndsAt: null });
    expect(resolveEntitlements(s, PAID, NOW).onlineDeposit).toBe(true);
  });

  it("treats a period ending exactly now as elapsed", () => {
    const s = sub("active", { currentPeriodEndsAt: new Date(NOW) });
    expect(resolveEntitlements(s, PAID, NOW).onlineDeposit).toBe(false);
  });
});

describe("resolveEntitlements — cancelled", () => {
  it("keeps entitlement until the paid period actually ends", () => {
    // They paid for this month; cancelling shouldn't claw the month back.
    const s = sub("cancelled", { currentPeriodEndsAt: at(5) });
    expect(resolveEntitlements(s, PAID, NOW)).toEqual({
      plan: "pro",
      onlineDeposit: true,
      // Not "active": the panel must be able to say it is ending.
      reason: "cancelled",
    });
  });

  it("drops entitlement once the paid period has passed", () => {
    const s = sub("cancelled", { currentPeriodEndsAt: at(-1) });
    expect(resolveEntitlements(s, PAID, NOW).onlineDeposit).toBe(false);
  });

  it("keeps online kapora on while the cancelled period runs", () => {
    // Cancelling must not switch off a feature they have already paid for.
    const s = sub("cancelled", { currentPeriodEndsAt: at(5) });
    expect(resolveEntitlements(s, PAID, NOW).onlineDeposit).toBe(true);
  });

  it("does not trust a cancelled row with no paid-through date", () => {
    // Asymmetric with 'active' on purpose: cancelled is a negative status.
    const s = sub("cancelled", { currentPeriodEndsAt: null });
    expect(resolveEntitlements(s, PAID, NOW).onlineDeposit).toBe(false);
  });
});

describe("resolveEntitlements — past_due grace", () => {
  it("keeps entitlement inside the retry window", () => {
    const s = sub("past_due", { currentPeriodEndsAt: at(-1) });
    expect(resolveEntitlements(s, PAID, NOW)).toEqual({
      plan: "pro",
      onlineDeposit: true,
      reason: "past_due",
    });
  });

  it("drops entitlement once the retry window closes", () => {
    const s = sub("past_due", {
      currentPeriodEndsAt: at(-PAST_DUE_GRACE_DAYS - 1),
    });
    expect(resolveEntitlements(s, PAID, NOW).onlineDeposit).toBe(false);
  });
});

describe("resolveEntitlements — the payout gate", () => {
  it("is Pro but cannot collect without a payout account", () => {
    expect(resolveEntitlements(sub("active"), null, NOW)).toEqual({
      plan: "pro",
      onlineDeposit: false,
      reason: "no_payout_account",
    });
  });

  it("is Pro but cannot collect while the submerchant is unapproved", () => {
    for (const status of ["pending", "rejected"] as const) {
      expect(resolveEntitlements(sub("active"), { status }, NOW)).toEqual({
        plan: "pro",
        onlineDeposit: false,
        reason: "payout_pending",
      });
    }
  });

  it("never reports a payout reason for an unpaid org", () => {
    // The upgrade CTA must win over the payout CTA when both are missing.
    expect(resolveEntitlements(null, null, NOW).reason).toBe("free");
  });
});
