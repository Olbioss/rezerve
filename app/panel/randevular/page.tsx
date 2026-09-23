import Link from "next/link";
import { PageHeader } from "@/components/panel/page-header";
import { Input } from "@/components/ui/input";
import { requireOwner } from "@/lib/auth-guard";
import {
  countBookings,
  loadBookings,
  PAGE_SIZE,
  type Tab,
} from "@/lib/panel/bookings-query";
import { BookingsList } from "./bookings-list";

export const metadata = { title: "Randevular" };

function hrefFor(tab: Tab, page: number, query: string) {
  const params = new URLSearchParams();
  if (tab === "past") params.set("sekme", "gecmis");
  if (page > 1) params.set("sayfa", String(page));
  if (query) params.set("ara", query);
  const qs = params.toString();
  return qs ? `/panel/randevular?${qs}` : "/panel/randevular";
}

const tabClass = (active: boolean) =>
  active
    ? "rounded-full bg-brand/15 px-3.5 py-1.5 font-medium text-brand-ink text-sm"
    : "rounded-full px-3.5 py-1.5 text-muted-foreground text-sm hover:bg-accent hover:text-foreground";

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ sekme?: string; sayfa?: string; ara?: string }>;
}) {
  const { organizationId, profile } = await requireOwner();
  const { sekme, sayfa, ara } = await searchParams;

  const tab: Tab = sekme === "gecmis" ? "past" : "upcoming";
  const query = (ara ?? "").trim();
  const now = new Date();

  const [upcomingCount, pastCount] = await Promise.all([
    countBookings(organizationId, "upcoming", query, now),
    countBookings(organizationId, "past", query, now),
  ]);

  const total = tab === "upcoming" ? upcomingCount : pastCount;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // A page number past the end would show nothing at all, which reads as "no
  // bookings" rather than "you have gone too far".
  const page = Math.min(Math.max(1, Number(sayfa) || 1), lastPage);

  const rows = await loadBookings(organizationId, tab, query, page, now);

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Randevular"
        description={`Saatler ${profile.timezone} saat dilimindedir.`}
      />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          <Link
            href={hrefFor("upcoming", 1, query)}
            aria-current={tab === "upcoming" ? "page" : undefined}
            className={tabClass(tab === "upcoming")}
          >
            Yaklaşan ({upcomingCount})
          </Link>
          <Link
            href={hrefFor("past", 1, query)}
            aria-current={tab === "past" ? "page" : undefined}
            className={tabClass(tab === "past")}
          >
            Geçmiş ({pastCount})
          </Link>
        </div>

        {/* A plain GET form: no JavaScript needed, and the result is a URL. */}
        <form className="flex items-center gap-2" action="/panel/randevular">
          {tab === "past" && (
            <input type="hidden" name="sekme" value="gecmis" />
          )}
          <Input
            type="search"
            name="ara"
            defaultValue={query}
            placeholder="İsim, e-posta, telefon veya hizmet"
            aria-label="Randevularda ara"
            className="h-9 w-56"
          />
        </form>
      </div>

      <BookingsList
        rows={rows}
        allowCancel={tab === "upcoming"}
        timezone={profile.timezone}
        currency={profile.currency}
        emptyHint={
          query
            ? `“${query}” ile eşleşen randevu yok.`
            : "Randevu sayfanızın adresini paylaşarak başlayın."
        }
      />

      {lastPage > 1 && (
        <nav
          aria-label="Sayfalar"
          className="flex items-center justify-between gap-4"
        >
          <PageLink
            href={hrefFor(tab, page - 1, query)}
            disabled={page <= 1}
            label="← Önceki"
          />
          <span className="numeral text-muted-foreground text-sm">
            {page} / {lastPage}
          </span>
          <PageLink
            href={hrefFor(tab, page + 1, query)}
            disabled={page >= lastPage}
            label="Sonraki →"
          />
        </nav>
      )}
    </div>
  );
}

function PageLink({
  href,
  disabled,
  label,
}: {
  href: string;
  disabled: boolean;
  label: string;
}) {
  if (disabled) {
    return <span className="text-muted-foreground/50 text-sm">{label}</span>;
  }
  return (
    <Link
      href={href}
      className="text-muted-foreground text-sm hover:text-foreground"
    >
      {label}
    </Link>
  );
}
