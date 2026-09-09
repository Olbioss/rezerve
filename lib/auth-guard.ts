import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/lib/auth";
import { getBilling } from "@/lib/billing/get-billing";
import { db } from "@/lib/db";
import { member } from "@/lib/db/schema/auth-schema";
import { businessProfiles } from "@/lib/db/schema/business-schema";

/**
 * Dashboard/action guard: requires a signed-in owner with a fully onboarded
 * business (organization + business profile). Redirects otherwise.
 *
 * Also the distribution point for billing entitlements — every panel page and
 * owner action already funnels through here, so gating never has to be
 * remembered at a call site.
 *
 * Memoised per request with React cache(): the panel layout and the page it
 * renders both call this, so without it every request paid for the session,
 * membership and profile lookups twice. Note that redirect() throws and the
 * throw is memoised too — correct, but surprising when debugging.
 */
export const requireOwner = cache(async () => {
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

  const billing = await getBilling(membership.organizationId);

  return {
    session,
    organizationId: membership.organizationId,
    profile,
    billing,
  };
});

/** Signed-in user (no business required) — used by the onboarding page. */
export async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/giris");
  return session;
}
