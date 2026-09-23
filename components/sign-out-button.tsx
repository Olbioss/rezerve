"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        await authClient.signOut();
        router.push("/");
        // The landing page renders by session: signing out while already on
        // it is a push to the same URL, which would keep the signed-in view.
        router.refresh();
      }}
    >
      Çıkış yap
    </Button>
  );
}
