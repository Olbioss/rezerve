import { eq } from "drizzle-orm";
import Link from "next/link";
import { requireOwner } from "@/lib/auth-guard";
import { db } from "@/lib/db";
import { organization } from "@/lib/db/schema/auth-schema";
import { SignOutButton } from "./sign-out-button";

const nav = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/bookings", label: "Bookings" },
  { href: "/dashboard/services", label: "Services" },
  { href: "/dashboard/availability", label: "Availability" },
  { href: "/dashboard/settings", label: "Settings" },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { organizationId } = await requireOwner();
  const org = await db.query.organization.findFirst({
    where: eq(organization.id, organizationId),
  });

  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="font-bold tracking-tight">
              Slotly
            </Link>
            <nav className="flex gap-4 text-sm">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {org && (
              <Link
                href={`/b/${org.slug}`}
                target="_blank"
                className="text-muted-foreground text-sm underline underline-offset-4"
              >
                /b/{org.slug}
              </Link>
            )}
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {children}
      </main>
    </div>
  );
}
