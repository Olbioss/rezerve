import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type BookingStatus = "pending" | "confirmed" | "cancelled";

const LABEL: Record<BookingStatus, string> = {
  confirmed: "onaylı",
  pending: "bekliyor",
  cancelled: "iptal",
};

const VARIANT = {
  confirmed: "default",
  pending: "outline",
  cancelled: "ghost",
} as const;

/** Booking status as a champagne chip, an outline, or a struck-out ghost. */
export function StatusBadge({ status }: { status: BookingStatus }) {
  return (
    <Badge
      variant={VARIANT[status]}
      className={cn(status === "cancelled" && "line-through")}
    >
      {LABEL[status]}
    </Badge>
  );
}
