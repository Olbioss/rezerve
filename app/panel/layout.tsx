import { Suspense } from "react";
import { PanelShell } from "@/components/panel/shell";
import { PanelShellSkeleton } from "@/components/panel/shell-skeleton";
import { SignOutButton } from "@/components/sign-out-button";
import { requireOwner } from "@/lib/auth-guard";

/**
 * The frame is part of the static shell; who is signed in is not. Until the
 * session resolves, every panel page shows PanelShellSkeleton. A visitor
 * without a session is sent to the login page from the browser, the page
 * having already started streaming.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<PanelShellSkeleton />}>
      <OwnerShell>{children}</OwnerShell>
    </Suspense>
  );
}

async function OwnerShell({ children }: { children: React.ReactNode }) {
  const { session, slug } = await requireOwner();
  return (
    <PanelShell
      slug={slug}
      userName={session.user.name}
      signOut={<SignOutButton />}
    >
      {children}
    </PanelShell>
  );
}
