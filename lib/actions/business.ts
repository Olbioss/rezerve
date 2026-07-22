"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { requireOwner, requireUser } from "@/lib/auth-guard";
import { db } from "@/lib/db";
import { member } from "@/lib/db/schema/auth-schema";
import { businessProfiles } from "@/lib/db/schema/business-schema";
import { slugSchema } from "@/lib/slug";

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

  redirect("/dashboard");
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
  currency: z.enum(["usd", "eur", "gbp", "try"]),
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
  redirect("/dashboard/settings");
}
