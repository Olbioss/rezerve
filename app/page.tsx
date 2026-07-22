import { Fraunces } from "next/font/google";
import Link from "next/link";

const fraunces = Fraunces({
  subsets: ["latin", "latin-ext"],
  variable: "--font-fraunces",
});

const display = "[font-family:var(--font-fraunces)]";

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
    n: "01",
    title: "Hesabınızı açın",
    body: "İşletme adınızı ve saat diliminizi girin — randevu sayfanız saniyeler içinde hazır.",
  },
  {
    n: "02",
    title: "Hizmet ve saatlerinizi ekleyin",
    body: "Süre, fiyat ve isterseniz kapora belirleyin; haftalık çalışma saatlerinizi girin.",
  },
  {
    n: "03",
    title: "Linkinizi paylaşın",
    body: "Adresinizi Instagram profilinize koyun — müşteriler boş saatleri görüp kendileri randevu alsın.",
  },
];

const FEATURES = [
  {
    title: "Kapora ile ön ödeme",
    body: "Gelmeyen müşteriye son. Stripe ile kapora alın; ödeme tamamlanana kadar saat 30 dakika bloke kalır, ödenmezse kendiliğinden boşalır.",
  },
  {
    title: "Çakışma imkânsız",
    body: "Aynı saat asla iki kez satılmaz. İki müşteri aynı anda tıklasa bile çakışma veritabanı seviyesinde engellenir.",
  },
  {
    title: "Anında e-posta bildirimi",
    body: "Her randevuda ve iptalde hem size hem müşterinize otomatik e-posta gider. Telefon trafiği biter.",
  },
  {
    title: "Kurallar sizin elinizde",
    body: "Randevu aralığı, minimum ön süre, kaç gün ileriye randevu alınabileceği — hepsini siz belirlersiniz.",
  },
];

function SlotTicker() {
  const chips = [...TICKER_SLOTS, ...TICKER_SLOTS];
  return (
    <div
      aria-hidden
      className="overflow-hidden border-[#e7dcc9] border-y bg-[#f4ecdf] py-3"
    >
      <div className="landing-marquee flex w-max gap-3">
        {chips.map((slot, i) => {
          const taken = i % 4 === 2;
          return (
            <span
              key={`${slot}-${i}`}
              className={`shrink-0 rounded-full border px-4 py-1 font-mono text-sm ${
                taken
                  ? "border-[#d8c9b0] text-[#a4937a] line-through"
                  : "border-[#211a13]/20 bg-[#faf5ee] text-[#211a13]"
              }`}
            >
              {slot}
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
      <div className="-z-10 absolute inset-0 scale-125 rounded-full bg-[radial-gradient(closest-side,#eadfcb,transparent)]" />
      <div className="rotate-[1.5deg] rounded-2xl border border-[#e7dcc9] bg-white p-5 shadow-[0_24px_60px_-24px_rgba(33,26,19,0.35)]">
        <p className={`${display} text-[#211a13] text-lg`}>Günnur Estetik</p>
        <p className="text-[#8a7a63] text-sm">Randevu alın</p>
        <div className="mt-4 rounded-lg border border-[#eee5d5] bg-[#faf5ee] p-3">
          <p className="font-medium text-[#211a13] text-sm">Cilt Bakımı</p>
          <p className="text-[#8a7a63] text-xs">60 dk · ₺1.500 · ₺300 kapora</p>
        </div>
        <div className="mt-3 flex gap-2">
          {["Çar 23", "Per 24", "Cum 25"].map((day, i) => (
            <span
              key={day}
              className={`rounded-md px-2.5 py-1 text-xs ${
                i === 0
                  ? "bg-[#211a13] text-[#faf5ee]"
                  : "border border-[#e7dcc9] text-[#5f5240]"
              }`}
            >
              {day}
            </span>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            ["09:00", "free"],
            ["10:30", "selected"],
            ["12:00", "taken"],
            ["14:30", "free"],
            ["16:00", "free"],
            ["17:30", "free"],
          ].map(([slot, state]) => (
            <span
              key={slot}
              className={`rounded-md py-1.5 text-center font-mono text-xs ${
                state === "selected"
                  ? "bg-[#c2542b] text-white"
                  : state === "taken"
                    ? "border border-[#eee5d5] text-[#c6b79e] line-through"
                    : "border border-[#e7dcc9] text-[#211a13]"
              }`}
            >
              {slot}
            </span>
          ))}
        </div>
        <div className="mt-4 rounded-lg bg-[#211a13] py-2.5 text-center font-medium text-[#faf5ee] text-sm">
          ₺300 kapora öde ve randevu al
        </div>
      </div>
      <div className="-bottom-5 -rotate-2 absolute right-0 rounded-full border border-[#e7dcc9] bg-white px-4 py-2 text-sm shadow-lg">
        <span className="mr-1 text-[#3f7d4e]">✓</span>
        <span className="text-[#211a13]">Randevunuz alındı!</span>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main
      className={`${fraunces.variable} min-h-svh bg-[#faf5ee] text-[#211a13]`}
    >
      {/* Header */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5">
        <span className={`${display} text-2xl italic`}>Slotly.</span>
        <nav className="flex items-center gap-2">
          <Link
            href="/giris"
            className="rounded-full px-4 py-2 text-sm transition-colors hover:bg-[#f0e7d8]"
          >
            Giriş yap
          </Link>
          <Link
            href="/kayit"
            className="rounded-full bg-[#211a13] px-4 py-2 text-[#faf5ee] text-sm transition-colors hover:bg-[#3a2f23]"
          >
            Hemen başla
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto grid w-full max-w-6xl items-center gap-12 px-5 pt-10 pb-20 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <p
            className="landing-fade mb-4 inline-block rounded-full border border-[#c2542b]/30 bg-[#c2542b]/10 px-3 py-1 text-[#a84621] text-sm"
            style={{ animationDelay: "0ms" }}
          >
            Yerel işletmeler için online randevu
          </p>
          <h1
            className={`${display} landing-fade text-balance font-medium text-5xl leading-[1.05] tracking-tight sm:text-6xl`}
            style={{ animationDelay: "90ms" }}
          >
            Müşterileriniz kendi randevusunu{" "}
            <em className="text-[#c2542b] not-italic underline decoration-[#c2542b]/30 decoration-wavy underline-offset-8">
              alsın
            </em>
            .
          </h1>
          <p
            className="landing-fade mt-6 max-w-lg text-[#5f5240] text-lg leading-relaxed"
            style={{ animationDelay: "180ms" }}
          >
            Kuaförden estetik merkezine, Slotly tüm yerel işletmelere kendi
            randevu sayfasını verir. Hizmetlerinizi ve saatlerinizi girin,
            linkinizi paylaşın — telefon susarken bile defteriniz dolsun.
          </p>
          <div
            className="landing-fade mt-8 flex flex-wrap items-center gap-3"
            style={{ animationDelay: "270ms" }}
          >
            <Link
              href="/kayit"
              className="rounded-full bg-[#c2542b] px-6 py-3 font-medium text-white transition-colors hover:bg-[#a84621]"
            >
              Ücretsiz başlayın
            </Link>
            <Link
              href="/r/demo"
              className="rounded-full border border-[#211a13]/20 px-6 py-3 font-medium transition-colors hover:bg-[#f0e7d8]"
            >
              Örnek sayfayı görün
            </Link>
          </div>
          <p
            className="landing-fade mt-5 text-[#8a7a63] text-sm"
            style={{ animationDelay: "360ms" }}
          >
            Kurulum 5 dakika · Müşterileriniz için üyelik gerekmez
          </p>
        </div>
        <div className="landing-fade" style={{ animationDelay: "240ms" }}>
          <HeroMockup />
        </div>
      </section>

      <SlotTicker />

      {/* How it works */}
      <section className="mx-auto w-full max-w-6xl px-5 py-20">
        <h2 className={`${display} text-3xl sm:text-4xl`}>Nasıl çalışır?</h2>
        <div className="mt-10 grid gap-10 sm:grid-cols-3">
          {STEPS.map((step) => (
            <div key={step.n}>
              <p className={`${display} text-6xl text-[#e0d2ba] italic`}>
                {step.n}
              </p>
              <h3 className="mt-3 font-semibold text-lg">{step.title}</h3>
              <p className="mt-2 text-[#5f5240] leading-relaxed">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="border-[#e7dcc9] border-t bg-[#f4ecdf]">
        <div className="mx-auto w-full max-w-6xl px-5 py-20">
          <h2 className={`${display} max-w-xl text-3xl sm:text-4xl`}>
            Küçük işletme, büyük dertler.{" "}
            <span className="text-[#c2542b]">Slotly dördünü de çözer.</span>
          </h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="rounded-2xl border border-[#e7dcc9] bg-[#faf5ee] p-6 transition-transform duration-300 hover:-translate-y-1 hover:shadow-[0_16px_40px_-20px_rgba(33,26,19,0.3)]"
              >
                <h3 className={`${display} text-xl`}>{feature.title}</h3>
                <p className="mt-2 text-[#5f5240] leading-relaxed">
                  {feature.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA band */}
      <section className="bg-[#211a13] text-[#faf5ee]">
        <div className="mx-auto w-full max-w-6xl px-5 py-24 text-center">
          <h2
            className={`${display} mx-auto max-w-2xl text-balance text-4xl leading-tight sm:text-5xl`}
          >
            Bugün kurun,{" "}
            <em className="text-[#e8926b] not-italic">yarın dolu başlayın.</em>
          </h2>
          <p className="mx-auto mt-4 max-w-md text-[#c6b79e]">
            Randevu sayfanız 5 dakikada yayında. Kredi kartı gerekmez.
          </p>
          <Link
            href="/kayit"
            className="mt-8 inline-block rounded-full bg-[#c2542b] px-8 py-4 font-medium text-lg text-white transition-colors hover:bg-[#a84621]"
          >
            Ücretsiz başlayın
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#211a13] text-[#8a7a63]">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 border-[#faf5ee]/10 border-t px-5 py-8 text-sm">
          <p>
            <span className={`${display} text-[#faf5ee] italic`}>Slotly.</span>{" "}
            — İşletmeniz için online randevu
          </p>
          <div className="flex gap-4">
            <Link href="/giris" className="hover:text-[#faf5ee]">
              Giriş yap
            </Link>
            <Link href="/kayit" className="hover:text-[#faf5ee]">
              Kayıt ol
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
