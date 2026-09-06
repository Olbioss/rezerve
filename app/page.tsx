import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";

const TICKER_SLOTS = [
  "09:00",
  "09:30",
  "10:00",
  "10:30",
  "11:00",
  "13:00",
  "13:30",
  "14:00",
  "15:30",
  "16:00",
  "17:30",
];

const STEPS = [
  {
    n: "1",
    title: "Hesabınızı açın",
    body: "İşletme adınızı ve saat diliminizi girin — randevu sayfanız saniyeler içinde hazır.",
  },
  {
    n: "2",
    title: "Hizmet ve saatlerinizi ekleyin",
    body: "Süre, fiyat ve isterseniz kapora belirleyin; haftalık çalışma saatlerinizi girin.",
  },
  {
    n: "3",
    title: "Linkinizi paylaşın",
    body: "Adresinizi Instagram profilinize koyun — müşteriler boş saatleri görüp kendileri randevu alsın.",
  },
];

const FEATURES = [
  {
    key: "Kapora",
    title: "Kapora ile ön ödeme",
    body: "Gelmeyen müşteriye son. iyzico ile kapora alın; ödeme tamamlanana kadar saat 30 dakika bloke kalır, ödenmezse kendiliğinden boşalır.",
  },
  {
    key: "Çakışma",
    title: "Çakışma imkânsız",
    body: "Aynı saat asla iki kez satılmaz. İki müşteri aynı anda tıklasa bile çakışma veritabanı seviyesinde engellenir.",
  },
  {
    key: "Bildirim",
    title: "Anında e-posta bildirimi",
    body: "Her randevuda ve iptalde hem size hem müşterinize otomatik e-posta gider. Telefon trafiği biter.",
  },
  {
    key: "Kurallar",
    title: "Kurallar sizin elinizde",
    body: "Randevu aralığı, minimum ön süre, kaç gün ileriye randevu alınabileceği — hepsini siz belirlersiniz.",
  },
];

const MOCK_SLOTS: Array<[string, "free" | "selected" | "taken"]> = [
  ["09:00", "taken"],
  ["09:30", "free"],
  ["10:00", "free"],
  ["10:30", "selected"],
  ["11:00", "taken"],
  ["11:30", "free"],
];

function SlotTicker() {
  const chips = [...TICKER_SLOTS, ...TICKER_SLOTS];
  return (
    <div aria-hidden className="overflow-hidden border-border border-y py-4">
      <div className="marquee flex w-max">
        {chips.map((slot, i) => {
          const taken = i % 4 === 2;
          return (
            <span
              key={`${slot}-${i}`}
              className={`numeral flex shrink-0 items-center gap-7 px-7 text-xl ${
                taken ? "text-muted-foreground/60 line-through" : ""
              }`}
            >
              {slot}
              <span className="text-brand not-italic">·</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function HeroMockup() {
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-sm">
      <div className="surface-ivory -rotate-[1.5deg] rounded-3xl p-6 shadow-[0_40px_80px_-30px_rgb(0_0_0/0.55)] ring-1 ring-hair">
        <p className="font-display text-2xl leading-none">
          Günnur <em className="text-brand-ink">Estetik</em>
        </p>
        <p className="eyebrow mt-2 text-muted-foreground">Randevu alın</p>

        <div className="mt-5 flex items-end justify-between border-border border-t pt-4">
          <div>
            <p className="font-medium">Cilt Bakımı</p>
            <p className="text-muted-foreground text-xs">60 dk · ₺300 kapora</p>
          </div>
          <p className="numeral text-2xl">₺1.500</p>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {MOCK_SLOTS.map(([slot, state]) => (
            <span
              key={slot}
              className={`numeral rounded-full border py-2 text-center ${
                state === "selected"
                  ? "border-brand bg-brand font-medium text-brand-foreground"
                  : state === "taken"
                    ? "border-transparent text-muted-foreground/50 line-through"
                    : "border-hair"
              }`}
            >
              {slot}
            </span>
          ))}
        </div>

        <div className="mt-5 rounded-full bg-brand py-3.5 text-center font-medium text-[0.8125rem] text-brand-foreground uppercase tracking-[0.12em]">
          ₺300 kapora öde ve randevu al
        </div>
      </div>

      <div className="-bottom-5 absolute right-0 rotate-3 rounded-full bg-card px-5 py-2.5 font-display text-lg text-brand-ink italic shadow-[0_20px_40px_-20px_rgb(0_0_0/0.6)] ring-1 ring-hair">
        Randevunuz alındı.
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6">
        <Wordmark href={null} />
        <nav className="flex items-center gap-2 sm:gap-3">
          <Button
            nativeButton={false}
            variant="ghost"
            size="sm"
            render={<Link href="/giris" />}
          >
            Giriş yap
          </Button>
          <Button
            nativeButton={false}
            variant="outline"
            size="sm"
            render={<Link href="/kayit" />}
          >
            Hemen başla
          </Button>
        </nav>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto grid w-full max-w-6xl items-center gap-14 px-5 pt-10 pb-20 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="min-w-0">
            <p
              className="eyebrow rise text-brand-ink"
              style={{ animationDelay: "0ms" }}
            >
              Yerel işletmeler için online randevu
            </p>
            <h1
              className="rise mt-5 break-words font-display text-[2.5rem] leading-[0.95] sm:text-6xl lg:text-7xl xl:text-[5rem]"
              style={{ animationDelay: "60ms" }}
            >
              Müşterileriniz kendi randevusunu{" "}
              <em className="text-brand-ink">alsın.</em>
            </h1>
            <p
              className="rise mt-7 max-w-lg text-lg text-muted-foreground leading-relaxed"
              style={{ animationDelay: "120ms" }}
            >
              Kuaförden estetik merkezine, Rezerve tüm yerel işletmelere kendi
              randevu sayfasını verir. Boş saatleriniz görünür, dolu saatleriniz
              kapalı; telefon susarken bile defteriniz dolsun.
            </p>
            <div
              className="rise mt-9 flex flex-wrap items-center gap-3"
              style={{ animationDelay: "180ms" }}
            >
              <Button
                nativeButton={false}
                variant="brand"
                size="lg"
                render={<Link href="/kayit" />}
              >
                Ücretsiz başlayın
              </Button>
              <Button
                nativeButton={false}
                variant="outline"
                size="lg"
                render={<Link href="/r/demo" />}
              >
                Örnek sayfayı görün
              </Button>
            </div>
            <p
              className="eyebrow rise mt-6 text-muted-foreground"
              style={{ animationDelay: "240ms" }}
            >
              Kurulum 5 dakika · Müşterileriniz için üyelik gerekmez
            </p>
          </div>
          <div className="rise" style={{ animationDelay: "160ms" }}>
            <HeroMockup />
          </div>
        </section>

        <SlotTicker />

        {/* How it works */}
        <section className="mx-auto w-full max-w-6xl px-5 py-24">
          <p className="eyebrow text-brand-ink">Nasıl çalışır?</p>
          <div className="mt-12 grid gap-12 sm:grid-cols-3">
            {STEPS.map((step) => (
              <div key={step.n}>
                <p className="font-display text-5xl text-brand italic leading-none">
                  {step.n}
                </p>
                <h3 className="mt-4 font-display text-2xl leading-tight">
                  {step.title}
                </h3>
                <p className="mt-3 max-w-[34ch] text-muted-foreground leading-relaxed">
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto w-full max-w-6xl px-5 pb-24">
          <p className="eyebrow text-brand-ink">Neden Rezerve</p>
          <h2 className="mt-4 max-w-[18ch] font-display text-4xl leading-[1.05] sm:text-5xl lg:text-6xl">
            Küçük işletme, büyük dertler. Rezerve{" "}
            <em className="text-brand-ink">dördünü de</em> çözer.
          </h2>
          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            {FEATURES.map((feature) => (
              <div
                key={feature.key}
                className="rounded-2xl bg-card p-7 ring-1 ring-border transition-[box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:ring-brand/50"
              >
                <p className="eyebrow text-brand-ink">{feature.key}</p>
                <h3 className="mt-4 font-display text-2xl leading-tight">
                  {feature.title}
                </h3>
                <p className="mt-3 text-muted-foreground leading-relaxed">
                  {feature.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto w-full max-w-6xl px-5 pb-24">
          <div className="surface-ivory rounded-3xl px-6 py-20 text-center ring-1 ring-hair">
            <h2 className="mx-auto max-w-[20ch] font-display text-4xl leading-[1.05] sm:text-5xl lg:text-6xl">
              Bugün kurun,{" "}
              <em className="text-brand-ink">yarın dolu başlayın.</em>
            </h2>
            <p className="mx-auto mt-5 max-w-md text-muted-foreground">
              Randevu sayfanız 5 dakikada yayında. Kredi kartı gerekmez.
            </p>
            <Button
              nativeButton={false}
              variant="brand"
              size="lg"
              className="mt-9"
              render={<Link href="/kayit" />}
            >
              Ücretsiz başlayın
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-border border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8">
          <p className="text-muted-foreground text-sm">
            <Wordmark href={null} className="text-xl" /> — İşletmeniz için
            online randevu
          </p>
          <div className="flex gap-5 text-sm">
            <Link
              href="/giris"
              className="underline-draw text-muted-foreground transition-colors hover:text-brand-ink"
            >
              Giriş yap
            </Link>
            <Link
              href="/kayit"
              className="underline-draw text-muted-foreground transition-colors hover:text-brand-ink"
            >
              Kayıt ol
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
