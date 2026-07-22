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

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setLoading(true);
    const { error } = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    setLoading(false);
    if (error) {
      toast.error(error.message ?? "Giriş başarısız");
      return;
    }
    router.push("/dashboard");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tekrar hoş geldiniz</CardTitle>
        <CardDescription>
          Randevularınızı yönetmek için giriş yapın.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="email">E-posta</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Şifre</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
            />
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? "Giriş yapılıyor…" : "Giriş yap"}
          </Button>
          <p className="text-center text-muted-foreground text-sm">
            Yeni misiniz?{" "}
            <Link href="/signup" className="underline underline-offset-4">
              Hesap oluşturun
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
