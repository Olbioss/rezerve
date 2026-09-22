import { describe, expect, it } from "vitest";
import { formatMoney, minutesToTime, timeToMinutes } from "./format";

describe("formatMoney", () => {
  it("groups thousands the Turkish way", () => {
    // The artifact — and the landing's own hero mock — show ₺1.500.
    expect(formatMoney(150_000, "try")).toBe("₺1.500");
    expect(formatMoney(220_000, "try")).toBe("₺2.200");
    expect(formatMoney(1_234_567_00, "try")).toBe("₺1.234.567");
  });

  it("shows kuruş with a comma, only when there are any", () => {
    expect(formatMoney(30_000, "try")).toBe("₺300");
    expect(formatMoney(30_050, "try")).toBe("₺300,50");
  });

  it("keeps small amounts ungrouped", () => {
    expect(formatMoney(80_000, "try")).toBe("₺800");
    expect(formatMoney(0, "try")).toBe("₺0");
  });

  it("falls back to the code for unmapped currencies", () => {
    expect(formatMoney(150_000, "chf")).toBe("CHF 1.500");
  });
});

describe("time helpers", () => {
  it("round-trips minutes and wall time", () => {
    expect(minutesToTime(540)).toBe("09:00");
    expect(minutesToTime(0)).toBe("00:00");
    expect(minutesToTime(1_439)).toBe("23:59");
    expect(timeToMinutes("09:00")).toBe(540);
    expect(timeToMinutes(minutesToTime(753))).toBe(753);
  });
});
