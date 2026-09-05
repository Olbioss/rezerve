"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/panel/empty-state";
import {
  type BookingStatus,
  StatusBadge,
} from "@/components/panel/status-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cancelBooking } from "@/lib/actions/bookings";
import { formatMoney } from "@/lib/format";

export type BookingRow = {
  id: string;
  customerName: string;
  customerEmail: string;
  startsAtISO: string;
  status: BookingStatus;
  depositCents: number | null;
  serviceName: string;
};

export function BookingsList({
  upcoming,
  past,
  timezone,
  currency,
}: {
  upcoming: BookingRow[];
  past: BookingRow[];
  timezone: string;
  currency: string;
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

  function renderTable(rows: BookingRow[], allowCancel: boolean) {
    if (rows.length === 0) {
      return (
        <EmptyState title="Henüz randevu yok.">
          Randevu sayfanızın adresini paylaşarak başlayın.
        </EmptyState>
      );
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
              <TableCell className="font-medium">
                {booking.serviceName}
              </TableCell>
              <TableCell>
                {booking.customerName}
                <span className="block text-muted-foreground text-xs">
                  {booking.customerEmail}
                </span>
              </TableCell>
              <TableCell className="numeral">
                {booking.depositCents
                  ? formatMoney(booking.depositCents, currency)
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

  return (
    <Tabs defaultValue="upcoming">
      <TabsList>
        <TabsTrigger value="upcoming">Yaklaşan ({upcoming.length})</TabsTrigger>
        <TabsTrigger value="past">Geçmiş ({past.length})</TabsTrigger>
      </TabsList>
      <TabsContent value="upcoming">{renderTable(upcoming, true)}</TabsContent>
      <TabsContent value="past">{renderTable(past, false)}</TabsContent>
    </Tabs>
  );
}
