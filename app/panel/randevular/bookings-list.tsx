"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/panel/empty-state";
import { StatusBadge } from "@/components/panel/status-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cancelBooking } from "@/lib/actions/bookings";
import { formatMoney } from "@/lib/format";
import type { BookingRow } from "@/lib/panel/bookings-query";
import { telHref } from "@/lib/phone";

/**
 * One page of one tab. Which tab, which page and any search term are the
 * server's business — they live in the URL — so all this still needs to be a
 * client component for is the cancel button.
 */
export function BookingsList({
  rows,
  allowCancel,
  timezone,
  currency,
  emptyHint,
}: {
  rows: BookingRow[];
  allowCancel: boolean;
  timezone: string;
  currency: string;
  emptyHint: string;
}) {
  const [pending, startTransition] = useTransition();

  function formatWhen(iso: string) {
    return new Date(iso).toLocaleString("tr-TR", {
      timeZone: timezone,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  if (rows.length === 0) {
    return <EmptyState title="Randevu yok.">{emptyHint}</EmptyState>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Tarih</TableHead>
          <TableHead>Hizmet</TableHead>
          <TableHead>Müşteri</TableHead>
          <TableHead>Kapora</TableHead>
          <TableHead>Durum</TableHead>
          {allowCancel && <TableHead />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((booking) => (
          <TableRow key={booking.id}>
            <TableCell className="numeral text-base">
              {formatWhen(booking.startsAtISO)}
            </TableCell>
            <TableCell className="font-medium">{booking.serviceName}</TableCell>
            <TableCell>
              {booking.customerName}
              <span className="block text-muted-foreground text-xs">
                {booking.customerEmail}
              </span>
              {booking.customerPhone && (
                <a
                  href={telHref(booking.customerPhone)}
                  className="numeral block text-muted-foreground text-xs hover:text-brand-ink"
                >
                  {booking.customerPhone}
                </a>
              )}
            </TableCell>
            <TableCell className="numeral">
              {booking.depositCents
                ? booking.depositRefunded
                  ? `${formatMoney(booking.depositCents, currency)} · iade edildi`
                  : formatMoney(booking.depositCents, currency)
                : "—"}
            </TableCell>
            <TableCell>
              <StatusBadge status={booking.status} />
            </TableCell>
            {allowCancel && (
              <TableCell className="text-right">
                {booking.status !== "cancelled" && (
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        await cancelBooking(booking.id);
                        toast.success("Randevu iptal edildi");
                      })
                    }
                  >
                    İptal et
                  </Button>
                )}
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
