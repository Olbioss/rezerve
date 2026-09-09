import { z } from "zod";

/**
 * Turkish identity/tax/bank field validation for submerchant onboarding.
 *
 * These run the real checksums rather than a length check. iyzico rejects a
 * bad number with an opaque error long after the owner has left the form, so
 * catching it here is the difference between "TCKN hatalı" and a shrug.
 *
 * Note: this is deliberately *stricter* than the iyzico sandbox, whose sample
 * TCKN (31300864726) does not satisfy the official check digits. Don't relax
 * it to match the samples — use a checksum-valid test value instead.
 */

/** T.C. Kimlik No: 11 digits, non-zero first, two trailing check digits. */
export function isValidTckn(value: string): boolean {
  if (!/^[1-9]\d{10}$/.test(value)) return false;
  const d = [...value].map(Number);
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  if ((odd * 7 - even) % 10 !== d[9]) return false;
  const sum = d.slice(0, 10).reduce((a, b) => a + b, 0);
  return sum % 10 === d[10];
}

/** Vergi Kimlik No: 10 digits with the official weighted checksum. */
export function isValidVkn(value: string): boolean {
  if (!/^\d{10}$/.test(value)) return false;
  const d = [...value].map(Number);
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const tmp = (d[i] + (9 - i)) % 10;
    if (tmp === 0) continue;
    const p = (tmp * 2 ** (9 - i)) % 9;
    sum += p === 0 ? 9 : p;
  }
  return (10 - (sum % 10)) % 10 === d[9];
}

/** Turkish IBAN: TR + 24 digits, validated with ISO 7064 mod-97. */
export function isValidTurkishIban(value: string): boolean {
  const compact = value.replace(/\s+/g, "").toUpperCase();
  if (!/^TR\d{24}$/.test(compact)) return false;
  const rearranged = compact.slice(4) + compact.slice(0, 4);
  const numeric = [...rearranged]
    .map((c) => (/[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c))
    .join("");
  // Iterative mod-97: the number is far past Number.MAX_SAFE_INTEGER, and
  // this avoids BigInt literals (tsconfig targets below ES2020).
  let remainder = 0;
  for (const ch of numeric) {
    remainder = (remainder * 10 + Number(ch)) % 97;
  }
  return remainder === 1;
}

/** "0535 000 00 00", "5350000000", "+905350000000" → "+905350000000". */
export function normalizeGsmNumber(value: string): string | null {
  const digits = value.replace(/[\s()-]/g, "").replace(/^\+/, "");
  let local = digits;
  if (local.startsWith("90")) local = local.slice(2);
  else if (local.startsWith("0")) local = local.slice(1);
  if (!/^5\d{9}$/.test(local)) return null;
  return `+90${local}`;
}

export const tcknSchema = z
  .string()
  .trim()
  .refine(isValidTckn, "Geçerli bir T.C. kimlik numarası girin");

export const vknSchema = z
  .string()
  .trim()
  .refine(isValidVkn, "Geçerli bir vergi kimlik numarası girin (10 hane)");

export const ibanSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\s+/g, "").toUpperCase())
  .refine(isValidTurkishIban, "Geçerli bir TR IBAN girin");

export const gsmSchema = z
  .string()
  .trim()
  .transform(normalizeGsmNumber)
  .refine((v): v is string => v !== null, "Geçerli bir cep telefonu girin");
