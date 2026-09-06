import Link from "next/link";
import { cn } from "@/lib/utils";

/** First letter of the business name, uppercased with Turkish casing. */
export function monogram(name: string): string {
  return (name.trim().charAt(0) || "R").toLocaleUpperCase("tr-TR");
}

/**
 * Chrome for the public booking pages: monogram, business name, and a
 * discreet Rezerve footer. Everything a customer arriving from an
 * Instagram link needs to believe this page belongs to the business.
 */
export function BookingShell({
  businessName,
  tagline,
  compact = false,
  children,
}: {
  businessName: string;
  tagline?: string;
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-1 flex-col">
      <main className="mx-auto w-full max-w-lg flex-1 px-5 pb-16">
        <header
          className={cn(
            "rise flex flex-col items-center text-center",
            compact ? "pt-10 pb-6" : "pt-14 pb-8"
          )}
        >
          <span
            aria-hidden
            className={cn(
              "flex items-center justify-center rounded-full border border-hair font-display text-brand-ink italic",
              compact ? "size-11 text-xl" : "size-14 text-2xl"
            )}
          >
            {monogram(businessName)}
          </span>
          <h1
            className={cn(
              "mt-4 font-display leading-none",
              compact ? "text-2xl" : "text-4xl"
            )}
          >
            {businessName}
          </h1>
          {tagline && (
            <p className="eyebrow mt-3 text-muted-foreground">{tagline}</p>
          )}
        </header>
        {children}
      </main>
      <footer className="border-border/60 border-t py-6 text-center">
        <Link
          href="/"
          className="underline-draw eyebrow text-muted-foreground transition-colors hover:text-brand-ink"
        >
          Rezerve ile alındı
        </Link>
      </footer>
    </div>
  );
}
