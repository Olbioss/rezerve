import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { member } from "@/lib/db/schema/auth-schema";
import { businessProfiles } from "@/lib/db/schema/business-schema";

/**
 * Dashboard/action guard: requires a signed-in owner with a fully onboarded
 * business (organization + business profile). Redirects otherwise.
 */
export async function requireOwner() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/giris");

  const membership = await db.query.member.findFirst({
    where: eq(member.userId, session.user.id),
  });
  if (!membership) redirect("/kurulum");

  const profile = await db.query.businessProfiles.findFirst({
    where: eq(businessProfiles.organizationId, membership.organizationId),
  });
  if (!profile) redirect("/kurulum");

  return { session, organizationId: membership.organizationId, profile };
}

/** Signed-in user (no business required) — used by the onboarding page. */
export async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/giris");
  return session;
}
