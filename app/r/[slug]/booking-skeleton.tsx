import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * A booking page's frame while its business loads: BookingShell's column,
 * with the monogram, the name and the services as placeholders.
 */
export function BookingSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex min-h-svh flex-1 flex-col">
      <main
        className="mx-auto w-full max-w-lg flex-1 px-5 pb-16"
        aria-busy="true"
      >
        <span className="sr-only">Yükleniyor…</span>
        <div
          className={cn(
            "flex flex-col items-center",
            compact ? "pt-10 pb-6" : "pt-14 pb-8"
          )}
        >
          <Skeleton className={compact ? "size-11" : "size-14"} />
          <Skeleton
            className={cn(
              "mt-4 rounded-2xl",
              compact ? "h-7 w-48" : "h-10 w-64"
            )}
          />
          <Skeleton className="mt-3 h-3 w-40" />
        </div>
        <div className="grid gap-3">
          {["a", "b", "c"].map((key) => (
            <Skeleton key={key} className="h-20 rounded-2xl" />
          ))}
        </div>
      </main>
    </div>
  );
}
