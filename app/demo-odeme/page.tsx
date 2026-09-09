import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import { getFakeCheckout } from "@/lib/payments/drivers/fake";

export const metadata = { title: "Demo ödeme" };

/**
 * The stand-in for iyzico's hosted payment page.
 *
 * Only the page is simulated: choosing an outcome POSTs to the real callback
 * route, so server-side verification and the idempotent transitions behind it
 * are exercised exactly as they would be in production.
 */
export default async function DemoPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const checkout = token ? await getFakeCheckout(token) : null;
  if (!token || !checkout) notFound();

  const isSubscription = checkout.flow === "subscription";
  const amount = isSubscription
    ? "₺299 / ay"
    : formatMoney(checkout.amountCents ?? 0, checkout.currency ?? "try");

  return (
    <main className="mx-auto grid min-h-svh max-w-md content-center gap-6 px-5 py-12">
      <div className="grid gap-2">
        <p className="eyebrow text-muted-foreground">Demo ödeme sayfası</p>
        <h1 className="font-display text-3xl">
          {isSubscription ? "Rezerve Pro aboneliği" : "Kapora ödemesi"}
        </h1>
        <p className="text-muted-foreground text-sm">
          {checkout.label ?? "Rezerve Pro — aylık abonelik"}
        </p>
      </div>

      <div className="rounded-xl border p-5">
        <p className="text-muted-foreground text-sm">Tutar</p>
        <p className="font-display text-3xl">{amount}</p>
      </div>

      <p className="rounded-lg border border-dashed p-3 text-muted-foreground text-xs">
        Bu bir demo ödeme ekranıdır — kart bilgisi istenmez ve gerçek para
        hareketi olmaz. Sonucu siz seçin; kalan akış gerçek kodla çalışır.
      </p>

      <form
        method="POST"
        action="/demo-odeme/karar"
        className="grid gap-3 sm:grid-cols-2"
      >
        <input type="hidden" name="token" value={token} />
        <Button type="submit" name="paid" value="1">
          Ödemeyi tamamla
        </Button>
        <Button type="submit" name="paid" value="0" variant="outline">
          Ödemeyi reddet
        </Button>
      </form>
    </main>
  );
}
