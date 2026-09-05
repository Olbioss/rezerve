import Link from "next/link";
import { cn } from "@/lib/utils";

/** "Rezerve" in Bodoni, with the "ve" in champagne italic. */
export function Wordmark({
  href = "/",
  className,
}: {
  href?: string | null;
  className?: string;
}) {
  const inner = (
    <span
      className={cn(
        "font-display text-[1.75rem] leading-none tracking-[-0.01em]",
        className
      )}
    >
      Rezer<em className="text-brand-ink">ve</em>
    </span>
  );
  if (!href) return inner;
  return (
    <Link href={href} className="inline-block no-underline">
      {inner}
    </Link>
  );
}
