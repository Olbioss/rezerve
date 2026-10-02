import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Wordmark } from "@/components/brand/wordmark";
import { requireUser } from "@/lib/auth-guard";
import { db } from "@/lib/db";
import { member } from "@/lib/db/schema/auth-schema";
import { businessProfiles } from "@/lib/db/schema/business-schema";
import { OnboardingForm } from "./onboarding-form";

export const metadata = { title: "İşletmenizi kurun" };

export default function OnboardingPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-8 p-6">
      <Wordmark className="text-4xl" />
      <div className="rise w-full max-w-md">
        <OnboardingForm />
      </div>
      <Suspense fallback={null}>
        <OnboardingGuard />
      </Suspense>
    </div>
  );
}

/**
 * Signed out → the login page; already onboarded → the panel. It runs at
 * request time beside the form, which is part of the static shell, and
 * renders nothing. completeOnboarding checks the session again regardless.
 */
async function OnboardingGuard() {
  const session = await requireUser();
  const membership = await db.query.member.findFirst({
    where: eq(member.userId, session.user.id),
  });
  if (membership) {
    const profile = await db.query.businessProfiles.findFirst({
      where: eq(businessProfiles.organizationId, membership.organizationId),
    });
    if (profile) redirect("/panel");
  }
  return null;
}
