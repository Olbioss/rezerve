import Link from "next/link";
import { EmptyState } from "@/components/panel/empty-state";
import { PageHeader } from "@/components/panel/page-header";
import { StatTile } from "@/components/panel/stat-tile";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireOwner } from "@/lib/auth-guard";
import { formatMoney } from "@/lib/format";
import { getPayouts, MAX_BOOKINGS_CHECKED } from "@/lib/panel/get-payouts";
import {
  heldNetCents,
  refundedNetCents,
  releasedNetCents,
} from "@/lib/panel/payouts";

export const metadata = { title: "Ödemeler" };

const RANGES = [
  { days: 7, label: "Son 7 gün" },
  { days: 30, label: "Son 30 gün" },
  { days: 90, label: "Son 90 gün" },
] as const;

// iyzico's times are already Istanbul wall-clock (see lib/panel/payouts.ts):
// render the digits as given, whatever timezone the server runs in.
const wallClock = (
  value: string | null,
  options: Intl.DateTimeFormatOptions
) =>
  value
    ? new Intl.DateTimeFormat("tr-TR", { ...options, timeZone: "UTC" }).format(
        new Date(`${value}Z`)
      )
    : "—";

const prettyDateTime = (value: string | null) =>
  wallClock(value, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const prettyDate = (value: string | null) =>
  wallClock(value, { day: "numeric", month: "short" });

export default async function PayoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ gun?: string }>;
}) {
  const { organizationId, profile } = await requireOwner();
  const { gun } = await searchParams;
  const windowDays =
    RANGES.find((r) => String(r.days) === gun)?.days ?? RANGES[1].days;

  const { rows, failed, truncated } = await getPayouts(
    organizationId,
    windowDays
  );

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Ödemeler"
        description="Tahsil edilen kaporalar ve hesabınıza geçen tutarlar."
      />

      <p className="text-muted-foreground text-sm">
        Kaporalar doğrudan iyzico tarafından IBAN'ınıza aktarılır — Rezerve
        paranızı tutmaz ve aktarımı başlatmaz. Randevu ücreti tahsil edildikten
        sonra tutar onaylanır ve serbest bırakılır; banka hesabınıza geçiş
        iyzico'nun ödeme takvimine göre ayrıca gerçekleşir.
      </p>

      <div className="flex flex-wrap gap-2">
        {RANGES.map((range) => (
          <Link
            key={range.days}
            href={`/panel/odemeler?gun=${range.days}`}
            aria-current={range.days === windowDays ? "page" : undefined}
            className={
              range.days === windowDays
                ? "rounded-full bg-brand/15 px-3.5 py-1.5 font-medium text-brand-ink text-sm"
                : "rounded-full px-3.5 py-1.5 text-muted-foreground text-sm hover:bg-accent hover:text-foreground"
            }
          >
            {range.label}
          </Link>
        ))}
      </div>

      {failed > 0 && rows.length === 0 ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
          Ödeme raporu şu anda alınamadı.
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title="Bu aralıkta ödeme yok">
          Online kapora tahsil edildiğinde burada görünür.
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatTile
              label="Serbest bırakılan"
              value={formatMoney(releasedNetCents(rows), profile.currency)}
              detail="Onaylandı, ödeme takvimine göre aktarılır"
            />
            <StatTile
              label="Onay bekleyen"
              value={formatMoney(heldNetCents(rows), profile.currency)}
              detail="Randevu tamamlanınca serbest bırakılır"
            />
            {refundedNetCents(rows) > 0 ? (
              <StatTile
                label="İade edilen"
                value={formatMoney(refundedNetCents(rows), profile.currency)}
                detail="İptal edilen randevular için müşteriye döndü"
              />
            ) : (
              <StatTile label="İşlem sayısı" value={String(rows.length)} />
            )}
          </div>

          {failed > 0 ? (
            <p className="text-muted-foreground text-sm">
              {failed} kaporanın bilgisi şu anda iyzico'dan alınamadı; sayfayı
              yenileyince görünebilir.
            </p>
          ) : null}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tarih</TableHead>
                <TableHead>Müşteri</TableHead>
                <TableHead>Hizmet</TableHead>
                <TableHead className="text-right">Tahsil edilen</TableHead>
                <TableHead className="text-right">iyzico kesintisi</TableHead>
                <TableHead className="text-right">Size ayrılan</TableHead>
                <TableHead>Durum</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.bookingId}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {prettyDateTime(row.paidAt)}
                  </TableCell>
                  <TableCell>{row.customerName}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.serviceName}
                  </TableCell>
                  <TableCell className="numeral text-right">
                    {formatMoney(row.grossCents, profile.currency)}
                  </TableCell>
                  <TableCell className="numeral text-right text-muted-foreground">
                    −{formatMoney(row.iyzicoCutCents, profile.currency)}
                  </TableCell>
                  <TableCell className="numeral text-right font-medium">
                    {row.refunded ? (
                      <s className="font-normal text-muted-foreground">
                        {formatMoney(row.netCents, profile.currency)}
                      </s>
                    ) : (
                      formatMoney(row.netCents, profile.currency)
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        row.approved && !row.refunded ? "default" : "ghost"
                      }
                    >
                      {row.refunded
                        ? "İade edildi"
                        : row.approved
                          ? "Serbest"
                          : "Onay bekliyor"}
                    </Badge>
                    {!row.refunded && row.releasesOn ? (
                      <span className="mt-1 block whitespace-nowrap text-muted-foreground text-xs">
                        Hakediş {prettyDate(row.releasesOn)}
                      </span>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {truncated ? (
            <p className="text-muted-foreground text-sm">
              Bu aralıktaki en yeni {MAX_BOOKINGS_CHECKED} kapora gösteriliyor.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
