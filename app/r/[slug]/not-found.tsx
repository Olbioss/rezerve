import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Randevu sayfası bulunamadı" };

/**
 * A booking link that leads nowhere. It came from a business, usually through
 * Instagram or a message, so the visitor needs to hear that the address is
 * wrong — not that the app is broken.
 */
export default function BookingPageNotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-8 p-6 text-center">
      <Wordmark className="text-4xl" />
      <div className="rise grid max-w-md gap-4">
        <p className="eyebrow text-brand-ink">404</p>
        <h1 className="font-display text-4xl leading-tight sm:text-5xl">
          Bu randevu sayfası <em className="text-brand-ink">bulunamadı.</em>
        </h1>
        <p className="text-muted-foreground leading-relaxed">
          Adres yanlış yazılmış ya da işletme sayfasını kaldırmış olabilir.
          Bağlantıyı aldığınız işletmeye doğru adresi sorabilirsiniz.
        </p>
        <div className="mt-2 flex justify-center">
          <Button
            nativeButton={false}
            variant="outline"
            render={<Link href="/" />}
          >
            Rezerve ana sayfası
          </Button>
        </div>
      </div>
    </main>
  );
}
