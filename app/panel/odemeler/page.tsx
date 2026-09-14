import Link from "next/link";
import { EmptyState } from "@/components/panel/empty-state";
import { PageHeader } from "@/components/panel/page-header";
import { StatTile } from "@/components/panel/stat-tile";
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
import { getPayouts } from "@/lib/panel/get-payouts";
import { totalNetCents } from "@/lib/panel/payouts";

export const metadata = { title: "Ödemeler" };

function localDay(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return d.toISOString().slice(0, 10);
}

const prettyDate = (iso: string) =>
  new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${iso}T00:00:00Z`));

export default async function PayoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ tarih?: string }>;
}) {
  const { organizationId, profile } = await requireOwner();
  const { tarih } = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(tarih ?? "")
    ? (tarih as string)
    : localDay();

  const { rows, error } = await getPayouts(organizationId, date);
  const shift = (days: number) =>
    new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86_400_000)
      .toISOString()
      .slice(0, 10);

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Ödemeler"
        description="Tahsil edilen kaporalar ve hesabınıza geçen tutarlar."
      />

      <p className="text-muted-foreground text-sm">
        Kaporalar doğrudan iyzico tarafından IBAN'ınıza aktarılır — Rezerve
        paranızı tutmaz ve aktarımı başlatmaz. Aşağıdaki tutarlar iyzico'nun
        işlem raporundan gelir.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`/panel/odemeler?tarih=${shift(-1)}`}
          className="text-muted-foreground text-sm underline underline-offset-4"
        >
          ← Önceki gün
        </Link>
        <span className="font-medium text-sm">{prettyDate(date)}</span>
        {date < localDay() && (
          <Link
            href={`/panel/odemeler?tarih=${shift(1)}`}
            className="text-muted-foreground text-sm underline underline-offset-4"
          >
            Sonraki gün →
          </Link>
        )}
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
          {error}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title="Bu tarihte ödeme yok">
          Online kapora tahsil edildiğinde burada görünür.
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <StatTile
              label="Hesabınıza geçen"
              value={formatMoney(totalNetCents(rows), profile.currency)}
            />
            <StatTile label="İşlem sayısı" value={String(rows.length)} />
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Müşteri</TableHead>
                <TableHead>Hizmet</TableHead>
                <TableHead className="text-right">Tahsil edilen</TableHead>
                <TableHead className="text-right">iyzico kesintisi</TableHead>
                <TableHead className="text-right">Size geçen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.bookingId}>
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
                    {formatMoney(row.netCents, profile.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  );
}
