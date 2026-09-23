import { eq } from "drizzle-orm";
import { PanelShell } from "@/components/panel/shell";
import { SignOutButton } from "@/components/sign-out-button";
import { requireOwner } from "@/lib/auth-guard";
import { db } from "@/lib/db";
import { organization } from "@/lib/db/schema/auth-schema";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { session, organizationId } = await requireOwner();
  const org = await db.query.organization.findFirst({
    where: eq(organization.id, organizationId),
  });

  return (
    <PanelShell
      slug={org?.slug ?? null}
      userName={session.user.name}
      signOut={<SignOutButton />}
    >
      {children}
    </PanelShell>
  );
}
