import { NextResponse } from "next/server";
import { requireEnv } from "@/lib/env";
import { recordFakeDecision } from "@/lib/payments/drivers/fake";

/**
 * Records the demo payment outcome, then hands off to the real callback.
 *
 * The redirect is a 307 so the browser repeats the POST with its body intact
 * — the callback then receives the same form-encoded token iyzico would have
 * sent, and runs unmodified.
 */
export async function POST(request: Request) {
  const appUrl = requireEnv("NEXT_PUBLIC_APP_URL");
  const form = await request.formData().catch(() => null);
  const token = form?.get("token");
  const paid = form?.get("paid") === "1";

  if (typeof token !== "string" || !token) {
    return NextResponse.redirect(new URL("/", appUrl), 303);
  }

  let callbackUrl: string;
  try {
    const opened = await recordFakeDecision(token, paid);
    callbackUrl = opened.callbackUrl ?? `${appUrl}/api/odeme/iyzico`;
  } catch (err) {
    console.error("Demo payment decision failed:", err);
    return NextResponse.redirect(new URL("/", appUrl), 303);
  }

  return NextResponse.redirect(new URL(callbackUrl, appUrl), 307);
}
