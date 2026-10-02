import { Skeleton } from "@/components/ui/skeleton";

/** The shape every panel page shares — a PageHeader, a row of tiles, a list. */
export function PageSkeleton() {
  return (
    <div className="grid gap-8" aria-busy="true">
      <span className="sr-only">Yükleniyor…</span>
      <div className="grid gap-3">
        <Skeleton className="h-12 w-72 max-w-full rounded-2xl" />
        <Skeleton className="h-4 w-56 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {["a", "b", "c"].map((key) => (
          <Skeleton key={key} className="h-28 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-3">
        {["a", "b", "c", "d"].map((key) => (
          <Skeleton key={key} className="h-14 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
