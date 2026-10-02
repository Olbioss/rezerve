"use client";

import "./globals.css";

/**
 * The root layout itself failed, so this replaces it: its own html and body,
 * and no app fonts — the display face falls back to Didot or Georgia, which
 * is fine for a page that should almost never render.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="tr">
      <body className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
        <title>Bir şeyler ters gitti · Rezerve</title>
        <h1 className="font-display text-4xl leading-tight">
          Bir şeyler <em className="text-brand-ink">ters gitti.</em>
        </h1>
        <p className="max-w-md text-muted-foreground">
          Sayfa yüklenirken beklenmedik bir hata oluştu.
        </p>
        <button
          type="button"
          onClick={() => unstable_retry()}
          className="mt-2 rounded-full bg-brand px-5 py-2.5 font-medium text-brand-foreground text-sm uppercase tracking-[0.12em]"
        >
          Tekrar dene
        </button>
        {error.digest && (
          <p className="eyebrow mt-4 text-muted-foreground">
            Hata kodu: {error.digest}
          </p>
        )}
      </body>
    </html>
  );
}
