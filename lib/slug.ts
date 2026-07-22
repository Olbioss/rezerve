import { z } from "zod";

/** Route segments that can never be business slugs. */
const RESERVED_SLUGS = new Set([
  "api",
  "b",
  "demo",
  "dashboard",
  "login",
  "signup",
  "onboarding",
  "admin",
  "settings",
  "about",
  "pricing",
  "terms",
  "privacy",
]);

export const slugSchema = z
  .string()
  .min(3, "Adres en az 3 karakter olmalı")
  .max(48, "Adres en fazla 48 karakter olabilir")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Küçük harf, rakam ve tek tire kullanın (örn. benim-salonum)"
  )
  .refine((slug) => !RESERVED_SLUGS.has(slug), "Bu adres kullanılamaz");

/** Best-effort slug suggestion from a business name. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
