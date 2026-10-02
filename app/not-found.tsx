import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Sayfa bulunamadı" };

/** Any address the app does not know, and every notFound() without its own page. */
export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-8 p-6 text-center">
      <Wordmark className="text-4xl" />
      <div className="rise grid max-w-md gap-4">
        <p className="eyebrow text-brand-ink">404</p>
        <h1 className="font-display text-4xl leading-tight sm:text-5xl">
          Bu sayfa <em className="text-brand-ink">bulunamadı.</em>
        </h1>
        <p className="text-muted-foreground leading-relaxed">
          Adres yanlış yazılmış ya da sayfa kaldırılmış olabilir.
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-3">
          <Button
            nativeButton={false}
            variant="brand"
            render={<Link href="/" />}
          >
            Ana sayfaya dönün
          </Button>
          <Button
            nativeButton={false}
            variant="outline"
            render={<Link href="/r/demo" />}
          >
            Örnek sayfayı görün
          </Button>
        </div>
      </div>
    </main>
  );
}
