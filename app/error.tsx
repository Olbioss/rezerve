"use client";

import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";

/**
 * An unexpected failure below the root layout. The digest is the only thing
 * that ties what the visitor saw to the server's log line, so it is shown.
 */
export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-8 p-6 text-center">
      <Wordmark className="text-4xl" />
      <div className="rise grid max-w-md gap-4">
        <h1 className="font-display text-4xl leading-tight sm:text-5xl">
          Bir şeyler <em className="text-brand-ink">ters gitti.</em>
        </h1>
        <p className="text-muted-foreground leading-relaxed">
          Sayfa yüklenirken beklenmedik bir hata oluştu. Tekrar deneyebilir ya
          da ana sayfaya dönebilirsiniz.
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-3">
          <Button variant="brand" onClick={() => unstable_retry()}>
            Tekrar dene
          </Button>
          <Button
            nativeButton={false}
            variant="outline"
            render={<Link href="/" />}
          >
            Ana sayfa
          </Button>
        </div>
        {error.digest && (
          <p className="eyebrow mt-4 text-muted-foreground">
            Hata kodu: {error.digest}
          </p>
        )}
      </div>
    </main>
  );
}
