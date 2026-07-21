"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
  status: "pending" | "confirmed" | "cancelled";
  depositCents: number | null;
  serviceName: string;
};

const statusVariant = {
  confirmed: "default",
  pending: "secondary",
  cancelled: "outline",
} as const;

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
    return new Date(iso).toLocaleString("en-US", {
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
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          Nothing here yet.
        </p>
      );
    }
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Service</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Deposit</TableHead>
            <TableHead>Status</TableHead>
            {allowCancel && <TableHead />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((booking) => (
            <TableRow key={booking.id}>
              <TableCell className="font-medium">
                {formatWhen(booking.startsAtISO)}
              </TableCell>
              <TableCell>{booking.serviceName}</TableCell>
              <TableCell>
                {booking.customerName}
                <span className="block text-muted-foreground text-xs">
                  {booking.customerEmail}
                </span>
              </TableCell>
              <TableCell>
                {booking.depositCents
                  ? formatMoney(booking.depositCents, currency)
                  : "—"}
              </TableCell>
              <TableCell>
                <Badge variant={statusVariant[booking.status]}>
                  {booking.status}
                </Badge>
              </TableCell>
              {allowCancel && (
                <TableCell className="text-right">
                  {booking.status !== "cancelled" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          await cancelBooking(booking.id);
                          toast.success("Booking cancelled");
                        })
                      }
                    >
                      Cancel
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
        <TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger>
        <TabsTrigger value="past">Past ({past.length})</TabsTrigger>
      </TabsList>
      <TabsContent value="upcoming">{renderTable(upcoming, true)}</TabsContent>
      <TabsContent value="past">{renderTable(past, false)}</TabsContent>
    </Tabs>
  );
}
