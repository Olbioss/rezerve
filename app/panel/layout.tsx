import { PanelShell } from "@/components/panel/shell";
import { SignOutButton } from "@/components/sign-out-button";
import { requireOwner } from "@/lib/auth-guard";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
