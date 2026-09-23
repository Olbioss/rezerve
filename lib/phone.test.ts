import { describe, expect, it } from "vitest";
import { optionalPhoneSchema, telHref } from "./phone";

const parse = (value: unknown) => optionalPhoneSchema.safeParse(value);

describe("optionalPhoneSchema", () => {
  it("accepts the ways a Turkish number is actually written", () => {
    for (const phone of [
      "0532 123 45 67",
      "05321234567",
      "+90 532 123 4567",
      "(0212) 555-01-00",
      "0850.000.00.00",
    ]) {
      expect(parse(phone)).toMatchObject({ success: true, data: phone });
    }
  });

  it("keeps the number as typed, only tidying whitespace", () => {
    // The business reads it back; reformatting it would be presumptuous.
    expect(parse("  0532   123 45 67 ")).toMatchObject({
      success: true,
      data: "0532 123 45 67",
    });
  });

  it("treats a missing or blank field as no phone", () => {
    for (const blank of [undefined, null, "", "   "]) {
      expect(parse(blank)).toMatchObject({ success: true, data: null });
    }
  });

  it("rejects what cannot be a phone number", () => {
    for (const junk of [
      "abc",
      "0532 123 45 67 dahili 12",
      "123 45",
      "05 32+123 45 67",
      "++90 532 123 45 67",
      "+90 532 123 45 67 89 01 23",
    ]) {
      expect(parse(junk).success).toBe(false);
    }
  });

  it("rejects anything absurdly long before looking at it", () => {
    expect(parse("1".repeat(40)).success).toBe(false);
  });
});

describe("telHref", () => {
  it("dials the digits, keeping an international prefix", () => {
    expect(telHref("0532 123 45 67")).toBe("tel:05321234567");
    expect(telHref("+90 (532) 123-45-67")).toBe("tel:+905321234567");
  });
});
