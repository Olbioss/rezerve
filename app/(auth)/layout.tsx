import { Wordmark } from "@/components/brand/wordmark";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-8 p-6">
      <Wordmark className="text-4xl" />
      <div className="rise w-full max-w-sm">{children}</div>
    </div>
  );
}
