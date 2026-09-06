"use client";

import {
  ArrowUpRightIcon,
  CalendarDaysIcon,
  ClockIcon,
  LayoutGridIcon,
  ListIcon,
  SettingsIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/brand/wordmark";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/panel", label: "Genel bakış", icon: LayoutGridIcon },
  { href: "/panel/randevular", label: "Randevular", icon: CalendarDaysIcon },
  { href: "/panel/hizmetler", label: "Hizmetler", icon: ListIcon },
  { href: "/panel/saatler", label: "Çalışma saatleri", icon: ClockIcon },
  { href: "/panel/ayarlar", label: "Ayarlar", icon: SettingsIcon },
];

/**
 * Owner workspace: a night rail beside an ivory page (and the reverse in
 * dark mode), so the panel reads as the same product as the booking page.
 */
export function PanelShell({
  slug,
  userName,
  signOut,
  children,
}: {
  slug: string | null;
  userName: string;
  signOut: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      <aside className="surface-night flex shrink-0 flex-col gap-6 px-4 py-5 md:w-60 md:px-5 md:py-7">
        <Wordmark href="/panel" className="text-2xl" />
        <nav className="-mx-1 flex gap-1 overflow-x-auto md:mx-0 md:flex-col">
          {NAV.map((item) => {
            const active =
              item.href === "/panel"
                ? pathname === "/panel"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-2.5 rounded-full px-3.5 py-2.5 text-sm transition-colors md:rounded-xl",
                  active
                    ? "bg-brand/15 font-medium text-brand-ink"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <item.icon className="size-4 shrink-0" />
                <span className="whitespace-nowrap">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        {slug && (
          <div className="mt-auto hidden border-border border-t pt-5 md:block">
            <p className="eyebrow text-muted-foreground">Randevu sayfanız</p>
            <Link
              href={`/r/${slug}`}
              target="_blank"
              className="mt-2 flex items-center gap-1 font-display text-brand-ink text-lg italic transition-opacity hover:opacity-80"
            >
              /r/{slug}
              <ArrowUpRightIcon className="size-3.5" />
            </Link>
          </div>
        )}
      </aside>

      <div className="surface-ivory flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-border border-b px-5 py-3.5 md:px-8">
          <span className="eyebrow text-muted-foreground">
            {new Date().toLocaleDateString("tr-TR", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </span>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm sm:inline">{userName}</span>
            {signOut}
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8 md:px-8 md:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
