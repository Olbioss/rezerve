import { z } from "zod";

/** Route segments that can never be business slugs. */
const RESERVED_SLUGS = new Set([
  "api",
  "b",
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
  .min(3, "Slug must be at least 3 characters")
  .max(48, "Slug must be at most 48 characters")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Use lowercase letters, numbers and single hyphens (e.g. my-salon)"
  )
  .refine((slug) => !RESERVED_SLUGS.has(slug), "This slug is reserved");

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
