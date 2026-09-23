import { MapPinIcon, PhoneIcon } from "lucide-react";
import Link from "next/link";
import { telHref } from "@/lib/phone";
import { cn } from "@/lib/utils";

/** A map search for a free-text address — no geocoding, no API key. */
function mapHref(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

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
  description,
  phone,
  address,
  compact = false,
  children,
}: {
  businessName: string;
  tagline?: string;
  /** The business in its own words, from its profile. */
  description?: string | null;
  phone?: string | null;
  address?: string | null;
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
          {description && (
            <p className="mt-4 max-w-sm whitespace-pre-line text-muted-foreground text-sm leading-relaxed">
              {description}
            </p>
          )}
          {(phone || address) && (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm">
              {phone && (
                <a
                  href={telHref(phone)}
                  className="underline-draw inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-brand-ink"
                >
                  <PhoneIcon aria-hidden className="size-3.5" />
                  <span className="numeral">{phone}</span>
                </a>
              )}
              {address && (
                <a
                  href={mapHref(address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline-draw inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-brand-ink"
                >
                  <MapPinIcon aria-hidden className="size-3.5" />
                  {address}
                </a>
              )}
            </div>
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
