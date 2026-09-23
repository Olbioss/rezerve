import { z } from "zod";

/** Digits and the punctuation people put between them — nothing else. */
const PHONE_CHARACTERS = /^\+?[\d\s().-]+$/;

/**
 * An optional phone number, checked loosely on purpose.
 *
 * Turkish numbers arrive as 0532 123 45 67, +90 532 123 4567 or
 * (0212) 555-01-00, and a business may give an international one. The only job
 * here is to turn away what cannot be a number — letters, an extension written
 * out, a stray plus — not to enforce one format. 7 to 15 digits: a short local
 * line up to the E.164 maximum.
 *
 * Stored as typed, with whitespace tidied, because a person reads it back.
 * Blank becomes null, so the field can simply be left empty.
 */
export const optionalPhoneSchema = z
  .string()
  .trim()
  .max(32, "Telefon numarası çok uzun")
  .nullish()
  .transform((value) => (value ? value.replace(/\s+/g, " ") : null))
  .refine(
    (value) => {
      if (value === null) return true;
      const digits = value.replace(/\D/g, "").length;
      return PHONE_CHARACTERS.test(value) && digits >= 7 && digits <= 15;
    },
    { message: "Geçerli bir telefon numarası girin" }
  );

/** A tel: link for a stored number: its digits, keeping a leading +. */
export function telHref(phone: string): string {
  const trimmed = phone.trim();
  return `tel:${trimmed.startsWith("+") ? "+" : ""}${trimmed.replace(/\D/g, "")}`;
}
