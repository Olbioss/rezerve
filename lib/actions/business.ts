"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { requireOwner, requireUser } from "@/lib/auth-guard";
import { db } from "@/lib/db";
import { pgErrorCode, UNIQUE_VIOLATION } from "@/lib/db/errors";
import { member, organization } from "@/lib/db/schema/auth-schema";
import {
  businessProfiles,
  organizationSlugHistory,
} from "@/lib/db/schema/business-schema";
import { optionalPhoneSchema } from "@/lib/phone";
import { slugSchema } from "@/lib/slug";
import { isSlugReserved } from "@/lib/slug-history";

const timezoneSchema = z.string().refine((tz) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}, "Geçersiz saat dilimi");

const onboardingSchema = z.object({
  name: z.string().min(2).max(80),
  slug: slugSchema,
  timezone: timezoneSchema,
});

export type ActionResult = { error: string } | undefined;

const ADDRESS_TAKEN = "Bu adres başka bir işletme tarafından kullanılıyor.";

/** Create the organization + business profile for a new owner. */
export async function completeOnboarding(
  input: z.infer<typeof onboardingSchema>
): Promise<ActionResult> {
  const session = await requireUser();
  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz bilgi" };
  }
  const { name, slug, timezone } = parsed.data;

  // Idempotent-ish: if the user already has an org, just ensure the profile.
  const existing = await db.query.member.findFirst({
    where: eq(member.userId, session.user.id),
  });

  let organizationId = existing?.organizationId;
  if (!organizationId) {
    // Another business's old address, kept so its shared links stay its own.
    if (await isSlugReserved(slug)) return { error: ADDRESS_TAKEN };
    try {
      const org = await auth.api.createOrganization({
        body: { name, slug },
        headers: await headers(),
      });
      if (!org) return { error: "İşletme oluşturulamadı" };
      organizationId = org.id;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "İşletme oluşturulamadı";
      return { error: message };
    }
  }

  await db
    .insert(businessProfiles)
    .values({ organizationId, timezone })
    .onConflictDoNothing({ target: businessProfiles.organizationId });

  redirect("/panel");
}

const settingsSchema = z.object({
  timezone: timezoneSchema,
  slotGranularityMinutes: z.number().int().min(5).max(240),
  minLeadTimeMinutes: z
    .number()
    .int()
    .min(0)
    .max(60 * 24 * 14),
  bookingWindowDays: z.number().int().min(1).max(365),
  contactEmail: z
    .email()
    .nullable()
    .or(z.literal("").transform(() => null)),
  currency: z.enum(["try"]),
});

export async function updateSettings(
  input: z.infer<typeof settingsSchema>
): Promise<ActionResult> {
  const { organizationId } = await requireOwner();
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz bilgi" };
  }
  await db
    .update(businessProfiles)
    .set(parsed.data)
    .where(eq(businessProfiles.organizationId, organizationId));
  redirect("/panel/ayarlar");
}

/** Free text that may be left empty: trimmed, and blank stored as null. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `En fazla ${max} karakter olabilir`)
    .nullish()
    .transform((value) => value || null);

const publicProfileSchema = z.object({
  phone: optionalPhoneSchema,
  address: optionalText(200),
  description: optionalText(500),
});

/**
 * What a customer sees about the business on its booking page: how to call
 * it, where it is, what it does. All optional — a page with none of them
 * still takes bookings — and all public, unlike contactEmail.
 */
export async function updatePublicProfile(
  input: z.input<typeof publicProfileSchema>
): Promise<ActionResult> {
  const { organizationId } = await requireOwner();
  const parsed = publicProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz bilgi" };
  }
  await db
    .update(businessProfiles)
    .set(parsed.data)
    .where(eq(businessProfiles.organizationId, organizationId));
  revalidatePath("/panel/ayarlar");
}

const identitySchema = z.object({
  name: z.string().min(2, "İşletme adı en az 2 karakter olmalı").max(80),
  slug: slugSchema,
});

/**
 * Rename the business, or move its public address.
 *
 * Separate from updateSettings because these two live on `organization`
 * rather than `business_profiles`, and because moving the address is not a
 * setting: links to the old one are already out there, on Instagram and in
 * messages. The old slug goes into organization_slug_history in the same
 * transaction, so /r/<old-slug> keeps leading here — and stays reserved for
 * this business, which may move back to it and make it current again.
 */
export async function updateBusinessIdentity(
  input: z.infer<typeof identitySchema>
): Promise<ActionResult> {
  const { organizationId } = await requireOwner();
  const parsed = identitySchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz bilgi" };
  }
  const { name, slug } = parsed.data;

  try {
    const reserved = await db.transaction(async (tx) => {
      const [current] = await tx
        .select({ slug: organization.slug })
        .from(organization)
        .where(eq(organization.id, organizationId))
        .for("update");
      const moving = current !== undefined && current.slug !== slug;
      if (moving) {
        const [held] = await tx
          .select({ organizationId: organizationSlugHistory.organizationId })
          .from(organizationSlugHistory)
          .where(eq(organizationSlugHistory.slug, slug));
        if (held && held.organizationId !== organizationId) return true;
      }

      await tx
        .update(organization)
        .set({ name, slug })
        .where(eq(organization.id, organizationId));

      if (moving) {
        await tx
          .insert(organizationSlugHistory)
          .values({ slug: current.slug, organizationId })
          .onConflictDoUpdate({
            target: organizationSlugHistory.slug,
            set: { organizationId, createdAt: sql`now()` },
          });
        // Back at an address it held before: current again, not history.
        await tx
          .delete(organizationSlugHistory)
          .where(
            and(
              eq(organizationSlugHistory.slug, slug),
              eq(organizationSlugHistory.organizationId, organizationId)
            )
          );
      }
      return false;
    });
    if (reserved) return { error: ADDRESS_TAKEN };
  } catch (err) {
    // organization.slug is unique, and the reserved-name check in slugSchema
    // cannot know what other businesses hold now.
    if (pgErrorCode(err) === UNIQUE_VIOLATION) return { error: ADDRESS_TAKEN };
    throw err;
  }

  revalidatePath("/panel/ayarlar");
  revalidatePath(`/r/${slug}`);
}
