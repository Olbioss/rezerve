import { NextResponse } from "next/server";
import { handleSubscriptionResult } from "@/lib/billing/handle-subscription-result";
import { requireEnv } from "@/lib/env";

/**
 * Subscription checkout callback.
 *
 * Like the deposit callback, the browser POST is never trusted: the token is
 * matched against the stored one and the result re-fetched server-side before
 * any state changes.
 */
export async function POST(request: Request) {
  const appUrl = requireEnv("NEXT_PUBLIC_APP_URL");
  const form = await request.formData().catch(() => null);
  const token = form?.get("token");
  if (typeof token !== "string" || !token) {
    return NextResponse.redirect(new URL("/panel/abonelik", appUrl), 303);
  }

  try {
    const { outcome } = await handleSubscriptionResult(token);
    const query =
      outcome === "activated" ? "?abonelik=basarili" : "?abonelik=basarisiz";
    return NextResponse.redirect(
      new URL(`/panel/abonelik${query}`, appUrl),
      303
    );
  } catch (err) {
    console.error("Subscription callback failed:", err);
    return NextResponse.redirect(
      new URL("/panel/abonelik?abonelik=hata", appUrl),
      303
    );
  }
}
