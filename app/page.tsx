import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="font-bold text-4xl tracking-tight sm:text-5xl">Slotly</h1>
      <p className="max-w-md text-lg text-muted-foreground">
        Online booking for your business. Set your services and hours — your
        customers book themselves.
      </p>
      <div className="flex gap-3">
        <Button size="lg" render={<Link href="/signup" />}>
          Get started
        </Button>
        <Button size="lg" variant="outline" render={<Link href="/login" />}>
          Log in
        </Button>
      </div>
    </main>
  );
}
