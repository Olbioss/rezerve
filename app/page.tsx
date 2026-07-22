import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="font-bold text-4xl tracking-tight sm:text-5xl">Slotly</h1>
      <p className="max-w-md text-lg text-muted-foreground">
        İşletmeniz için online randevu. Hizmetlerinizi ve çalışma saatlerinizi
        belirleyin — müşterileriniz kendi randevusunu alsın.
      </p>
      <div className="flex gap-3">
        <Button size="lg" nativeButton={false} render={<Link href="/signup" />}>
          Hemen başla
        </Button>
        <Button
          size="lg"
          variant="outline"
          nativeButton={false}
          render={<Link href="/login" />}
        >
          Giriş yap
        </Button>
      </div>
    </main>
  );
}
