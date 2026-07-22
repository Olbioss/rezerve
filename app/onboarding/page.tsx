import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-guard";
import { db } from "@/lib/db";
import { member } from "@/lib/db/schema/auth-schema";
import { businessProfiles } from "@/lib/db/schema/business-schema";
import { OnboardingForm } from "./onboarding-form";

export const metadata = { title: "İşletmenizi kurun" };

export default async function OnboardingPage() {
  const session = await requireUser();

  // Already onboarded → dashboard.
  const membership = await db.query.member.findFirst({
    where: eq(member.userId, session.user.id),
  });
  if (membership) {
    const profile = await db.query.businessProfiles.findFirst({
      where: eq(businessProfiles.organizationId, membership.organizationId),
    });
    if (profile) redirect("/dashboard");
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        <OnboardingForm />
      </div>
    </div>
  );
}
