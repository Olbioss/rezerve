import { describe, expect, it } from "vitest";
import { TEST_PAYOUT_DEFAULTS } from "./test-mode";
import {
  isValidTckn,
  isValidTurkishIban,
  isValidVkn,
  normalizeGsmNumber,
} from "./validators";

describe("isValidTckn", () => {
  it("accepts numbers with correct check digits", () => {
    expect(isValidTckn("10000000146")).toBe(true);
  });

  it("rejects a single-digit typo that keeps the right length", () => {
    // The whole point of the checksum: iyzico would reject this opaquely.
    expect(isValidTckn("10000000147")).toBe(false);
    expect(isValidTckn("10000000246")).toBe(false);
  });

  it("rejects a leading zero", () => {
    expect(isValidTckn("01000000146")).toBe(false);
  });

  it("rejects wrong lengths and non-digits", () => {
    expect(isValidTckn("1000000014")).toBe(false);
    expect(isValidTckn("100000001460")).toBe(false);
    expect(isValidTckn("1000000014a")).toBe(false);
    expect(isValidTckn("")).toBe(false);
  });

  it("rejects iyzico's own sample, which is not checksum-valid", () => {
    // Documented on purpose so nobody "fixes" the validator to match it.
    expect(isValidTckn("31300864726")).toBe(false);
  });
});

describe("isValidVkn", () => {
  it("accepts numbers with the correct weighted check digit", () => {
    expect(isValidVkn("8720000007")).toBe(true);
    expect(isValidVkn("4540000009")).toBe(true);
  });

  it("rejects a wrong check digit", () => {
    expect(isValidVkn("8720000008")).toBe(false);
  });

  it("rejects the 7-digit legacy form", () => {
    expect(isValidVkn("9261877")).toBe(false);
  });
});

describe("isValidTurkishIban", () => {
  it("accepts a valid TR IBAN", () => {
    expect(isValidTurkishIban("TR180006200119000006672315")).toBe(true);
  });

  it("tolerates spacing and lower case", () => {
    expect(isValidTurkishIban("tr18 0006 2001 1900 0006 6723 15")).toBe(true);
  });

  it("rejects a transposed digit", () => {
    expect(isValidTurkishIban("TR180006200119000006672351")).toBe(false);
  });

  it("rejects wrong lengths and non-TR countries", () => {
    expect(isValidTurkishIban("TR18000620011900000667231")).toBe(false);
    expect(isValidTurkishIban("DE89370400440532013000")).toBe(false);
  });
});

describe("normalizeGsmNumber", () => {
  it("normalises the shapes people actually type", () => {
    for (const input of [
      "05350000000",
      "5350000000",
      "+905350000000",
      "0535 000 00 00",
      "(0535) 000-00-00",
      "90 535 000 00 00",
    ]) {
      expect(normalizeGsmNumber(input)).toBe("+905350000000");
    }
  });

  it("rejects numbers that are not Turkish mobiles", () => {
    expect(normalizeGsmNumber("02120000000")).toBeNull();
    expect(normalizeGsmNumber("535000000")).toBeNull();
    expect(normalizeGsmNumber("abc")).toBeNull();
  });
});

describe("test-mode prefill", () => {
  it("passes our own validators", () => {
    // A prefill the form would reject is worse than no prefill at all.
    expect(isValidTckn(TEST_PAYOUT_DEFAULTS.identityNumber)).toBe(true);
    expect(isValidVkn(TEST_PAYOUT_DEFAULTS.taxNumber)).toBe(true);
    expect(isValidTurkishIban(TEST_PAYOUT_DEFAULTS.iban)).toBe(true);
    expect(normalizeGsmNumber(TEST_PAYOUT_DEFAULTS.gsmNumber)).toBe(
      TEST_PAYOUT_DEFAULTS.gsmNumber
    );
  });
});
