"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { PLANS } from "@/lib/billing/plans";
import {
  DEMO_FREE,
  DEMO_PASSWORD,
  DEMO_PRO,
  type DemoAccount,
} from "@/lib/demo/credentials";

const DEMOS = [
  { plan: PLANS.pro.name, account: DEMO_PRO },
  { plan: PLANS.free.name, account: DEMO_FREE },
];

export function LoginForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  // Controlled, so picking a demo account can fill them in.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const { error } = await authClient.signIn.email({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message ?? "Giriş başarısız");
      return;
    }
    router.push("/panel");
  }

  function fillDemo(account: DemoAccount) {
    setEmail(account.email);
    setPassword(account.password);
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>
            Tekrar <em className="text-brand-ink">hoş geldiniz</em>
          </CardTitle>
          <CardDescription>
            Randevularınızı yönetmek için giriş yapın.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-5">
            <div className="grid gap-1.5">
              <Label htmlFor="email">E-posta</Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="password">Şifre</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" variant="brand" disabled={loading}>
              {loading ? "Giriş yapılıyor…" : "Giriş yap"}
            </Button>
            <p className="text-center text-muted-foreground text-sm">
              Yeni misiniz?{" "}
              <Link
                href="/kayit"
                className="text-brand-ink underline underline-offset-4"
              >
                Hesap oluşturun
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
      <DemoAccounts onPick={fillDemo} />
    </div>
  );
}

/**
 * The published demo logins, on the page where they are typed. Picking one
 * fills the form instead of signing in, so the visitor still sees what they
 * sign in with.
 */
function DemoAccounts({ onPick }: { onPick: (account: DemoAccount) => void }) {
  return (
    <section
      aria-labelledby="demo-accounts"
      className="rounded-2xl p-4 text-sm ring-1 ring-hair"
    >
      <p id="demo-accounts" className="eyebrow px-2 text-brand-ink">
        Demo hesapları
      </p>
      <ul className="mt-2 grid gap-1">
        {DEMOS.map(({ plan, account }) => (
          <li key={account.email}>
            <button
              type="button"
              onClick={() => onPick(account)}
              className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-2 text-left outline-none transition-colors hover:bg-accent/60 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="grid min-w-0">
                <span className="eyebrow text-muted-foreground">{plan}</span>
                <span className="break-words font-medium">{account.email}</span>
              </span>
              <span className="eyebrow shrink-0 text-brand-ink">Doldur</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-2 px-2 text-muted-foreground">
        Şifre:{" "}
        <span className="font-medium text-foreground">{DEMO_PASSWORD}</span> ·
        Her sabah sıfırlanır
      </p>
    </section>
  );
}
