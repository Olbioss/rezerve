import { Wordmark } from "@/components/brand/wordmark";
import { Skeleton } from "@/components/ui/skeleton";
import { PageSkeleton } from "./page-skeleton";

/**
 * The panel's frame before the owner is known: PanelShell's layout with its
 * session-dependent parts — the address link, the name, the date — as
 * placeholders. It is the static shell of every panel page, shown while the
 * session resolves; PanelShell itself cannot be, as it prints today's date.
 */
export function PanelShellSkeleton() {
  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      <aside className="surface-night flex shrink-0 flex-col gap-6 px-4 py-5 md:w-60 md:px-5 md:py-7">
        <Wordmark href="/panel" className="text-2xl" />
        <div className="-mx-1 flex gap-1 overflow-hidden md:mx-0 md:flex-col">
          {["a", "b", "c", "d", "e", "f", "g"].map((key) => (
            <Skeleton
              key={key}
              className="h-10 w-24 shrink-0 rounded-full md:w-full md:rounded-xl"
            />
          ))}
        </div>
      </aside>
      <div className="surface-ivory flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-border border-b px-5 py-3.5 md:px-8">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-8 w-28" />
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8 md:px-8 md:py-10">
          <PageSkeleton />
        </main>
      </div>
    </div>
  );
}
