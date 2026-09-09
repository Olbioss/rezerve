import { eq } from "drizzle-orm";
import { after } from "next/server";
import { PanelShell } from "@/components/panel/shell";
import { requireOwner } from "@/lib/auth-guard";
import { reconcileIfStale } from "@/lib/billing/sync-subscription";
import { db } from "@/lib/db";
import { organization } from "@/lib/db/schema/auth-schema";
import { SignOutButton } from "./sign-out-button";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { session, organizationId } = await requireOwner();
  // Self-heals subscription state on any panel visit without blocking the
  // render — the backstop for renewals that happen with nobody present.
  after(() => reconcileIfStale(organizationId));
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
