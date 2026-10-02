import { PageSkeleton } from "@/components/panel/page-skeleton";

/**
 * Shown inside the panel while the next page renders on the server, so a
 * click answers at once instead of after the round trip — or after a cold
 * start, which is most first clicks on a quiet demo.
 */
export default function PanelLoading() {
  return <PageSkeleton />;
}
