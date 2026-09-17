import Link from "next/link";
import { CardForm } from "@/components/billing/card-form";
import {
  CancelSubscriptionButton,
  StartTrialButton,
} from "@/components/billing/subscription-actions";
import { PageHeader } from "@/components/panel/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireOwner } from "@/lib/auth-guard";
import type { EntitlementReason } from "@/lib/billing/entitlements";
import { PLANS, TRIAL_DAYS } from "@/lib/billing/plans";
import { IS_TEST_MODE, TEST_CARDS } from "@/lib/billing/test-mode";
import { formatMoney } from "@/lib/format";

export const metadata = { title: "Abonelik" };

/** One sentence per state, so the page never has to re-derive the rules. */
const REASON_COPY: Record<EntitlementReason, string> = {
  free: "Ücretsiz plandasınız. Online kapora Pro ile açılır.",
  expired: "Aboneliğiniz sona erdi. Online kapora şu an kapalı.",
  no_payout_account:
    "Pro aktif. Kapora toplayabilmek için ödeme hesabınızı tanımlayın.",
  payout_pending:
    "Ödeme hesabınız henüz doğrulanmadı. Doğrulanınca kapora açılır.",
  trialing:
    "Deneme sürümündesiniz. Online kapora açık — deneme bitince karta geçmeniz gerekir.",
  active: "Pro aktif. Online kapora açık.",
  past_due:
    "Son ödeme alınamadı. Kartınızı güncelleyin — kapora kısa süre daha açık.",
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ abonelik?: string }>;
}) {
  const { billing } = await requireOwner();
  const { abonelik } = await searchParams;
  const { subscription, payoutAccount, plan, reason, onlineDeposit } = billing;

  return (
    <div className="grid max-w-3xl gap-8">
      <PageHeader
        title="Abonelik"
        description="Planınız ve kapora ödeme hesabınız."
      />

      {abonelik === "basarisiz" && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
          Ödeme tamamlanmadı. Aboneliğiniz başlatılmadı.
        </p>
      )}
      {abonelik === "hata" && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
          Ödeme sonucu doğrulanamadı. Lütfen tekrar deneyin.
        </p>
      )}

      <div className="grid gap-2 rounded-xl border p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{PLANS[plan].name}</Badge>
          {IS_TEST_MODE && <Badge variant="ghost">Test modu</Badge>}
          {onlineDeposit && <Badge variant="ghost">Kapora açık</Badge>}
        </div>
        <p className="text-muted-foreground text-sm">{REASON_COPY[reason]}</p>
        {subscription?.currentPeriodEndsAt && (
          <p className="text-muted-foreground text-xs">
            {subscription.status === "cancelled" ? "Bitiş" : "Yenileme"}:{" "}
            {formatDate(subscription.currentPeriodEndsAt)}
          </p>
        )}
        {subscription?.status === "trialing" && subscription.trialEndsAt && (
          <p className="text-muted-foreground text-xs">
            Deneme bitişi: {formatDate(subscription.trialEndsAt)}
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          {reason === "free" && !subscription && (
            <StartTrialButton label={`${TRIAL_DAYS} gün ücretsiz deneyin`} />
          )}
          {(reason === "no_payout_account" || reason === "payout_pending") && (
            <Button
              render={<Link href="/panel/abonelik/odeme-hesabi" />}
              nativeButton={false}
            >
              Ödeme hesabınızı tanımlayın
            </Button>
          )}
          {(reason === "active" ||
            reason === "trialing" ||
            reason === "past_due") && <CancelSubscriptionButton />}
        </div>
      </div>

      {(reason === "free" || reason === "expired" || reason === "past_due") && (
        <div className="grid gap-4 rounded-xl border p-5">
          <div>
            <p className="font-medium text-sm">
              {reason === "past_due" ? "Kartınızı güncelleyin" : "Pro'ya geçin"}
            </p>
            <p className="mt-1 text-muted-foreground text-sm">
              Kartınız yenilemeler için iyzico'da saklanır; Rezerve kart
              numaranızı saklamaz.
            </p>
          </div>
          <CardForm
            mode={reason === "past_due" ? "update" : "subscribe"}
            testCard={
              IS_TEST_MODE
                ? { number: TEST_CARDS[0].number, hint: TEST_CARDS[0].hint }
                : null
            }
          />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {(["free", "pro"] as const).map((key) => {
          const definition = PLANS[key];
          return (
            <div
              key={key}
              className="grid content-start gap-3 rounded-xl border p-5"
            >
              <div className="flex items-baseline gap-1">
                <span className="font-display text-2xl">{definition.name}</span>
                {plan === key && <Badge variant="ghost">Mevcut plan</Badge>}
              </div>
              <p className="font-medium text-lg">
                {formatMoney(definition.priceCents, "try")}
                <span className="text-muted-foreground text-sm">
                  {definition.interval}
                </span>
              </p>
              <p className="text-muted-foreground text-sm">
                {definition.tagline}
              </p>
              <ul className="grid gap-1 text-sm">
                {definition.bullets.map((bullet) => (
                  <li key={bullet} className="text-muted-foreground">
                    · {bullet}
                  </li>
                ))}
              </ul>
              <p className="text-muted-foreground text-xs">
                {definition.footnote}
              </p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-2 rounded-xl border p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-sm">Ödeme hesabı</span>
          {payoutAccount ? (
            <Badge variant="ghost">
              {payoutAccount.status === "active"
                ? "Aktif"
                : payoutAccount.status === "rejected"
                  ? "Doğrulanamadı"
                  : "Onay bekliyor"}
            </Badge>
          ) : (
            <Badge variant="ghost">Tanımlı değil</Badge>
          )}
        </div>
        <p className="text-muted-foreground text-sm">
          {payoutAccount
            ? `IBAN ${maskIban(payoutAccount.iban)}`
            : "Kaporalar doğrudan sizin banka hesabınıza geçer."}
        </p>
        <div>
          <Button
            variant="outline"
            render={<Link href="/panel/abonelik/odeme-hesabi" />}
            nativeButton={false}
          >
            {payoutAccount ? "Bilgileri güncelle" : "Ödeme hesabını tanımla"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** TR** **** …2315 — enough to recognise, not enough to leak. */
function maskIban(iban: string): string {
  return `TR** **** …${iban.slice(-4)}`;
}
