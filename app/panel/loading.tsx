import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shown inside the panel while the next page renders on the server, so a
 * click answers at once instead of after the round trip — or after a cold
 * start, which is most first clicks on a quiet demo. The shape follows the
 * pages: a PageHeader, a row of tiles, then a list.
 */
export default function PanelLoading() {
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
