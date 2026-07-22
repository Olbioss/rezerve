import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6">
      <Link href="/" className="font-bold text-2xl tracking-tight">
        Rezerve
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
