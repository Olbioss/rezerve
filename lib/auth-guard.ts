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

  // One round trip instead of two: the profile lookup only needed the
  // organization id, which the membership row already carries.
  const [row] = await db
    .select({
      organizationId: member.organizationId,
      profile: businessProfiles,
    })
    .from(member)
    .leftJoin(
      businessProfiles,
      eq(businessProfiles.organizationId, member.organizationId)
    )
    .where(eq(member.userId, session.user.id))
    .limit(1);

  if (!row) redirect("/kurulum");
  const { organizationId, profile } = row;
  if (!profile) redirect("/kurulum");

  const billing = await getBilling(organizationId);

  return { session, organizationId, profile, billing };
});

/**
 * For the sign-in and sign-up pages: someone already signed in goes to the
 * panel. Without it, a new tab that starts from the landing page offers the
 * login form to a visitor holding a valid session, and they sign in again.
 */
export async function redirectIfSignedIn() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect("/panel");
}

/** Signed-in user (no business required) — used by the onboarding page. */
export async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/giris");
  return session;
}
