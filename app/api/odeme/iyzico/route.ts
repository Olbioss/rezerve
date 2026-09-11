import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { organization } from "@/lib/db/schema/auth-schema";
import { bookings } from "@/lib/db/schema/booking-schema";
import { requireEnv } from "@/lib/env";
import { getPaymentProvider } from "@/lib/payments";
import {
  cancelFailedPayment,
  confirmPaidBooking,
} from "@/lib/payments/handle-payment-result";
import type { CheckoutResult } from "@/lib/payments/provider";

/**
 * iyzico Checkout Form callback. The customer's browser is POSTed here after
 * payment (form-encoded `token`). We never trust the POST itself — the result
 * is retrieved from iyzico's API server-side, then the browser is redirected.
 */
export async function POST(request: Request) {
  const appUrl = requireEnv("NEXT_PUBLIC_APP_URL");
  const form = await request.formData().catch(() => null);
  const token = form?.get("token");
  if (typeof token !== "string" || !token) {
    return NextResponse.redirect(new URL("/", appUrl), 303);
  }

  let result: CheckoutResult;
  try {
    result = await getPaymentProvider("deposits").retrieveCheckout(token);
  } catch (err) {
    console.error("iyzico retrieve failed:", err);
    return NextResponse.redirect(new URL("/", appUrl), 303);
  }
  if (!result.bookingId) {
    return NextResponse.redirect(new URL("/", appUrl), 303);
  }

  const booking = await db.query.bookings.findFirst({
    where: eq(bookings.id, result.bookingId),
  });
  if (!booking) {
    return NextResponse.redirect(new URL("/", appUrl), 303);
  }
  const org = await db.query.organization.findFirst({
    where: eq(organization.id, booking.organizationId),
  });
  const slug = org?.slug ?? "";

  if (result.paid) {
    await confirmPaidBooking(booking.id, token);
    return NextResponse.redirect(
      new URL(`/r/${slug}/onay/${booking.id}`, appUrl),
      303
    );
  }

  await cancelFailedPayment(booking.id, token);
  return NextResponse.redirect(
    new URL(`/r/${slug}?odeme=basarisiz`, appUrl),
    303
  );
}
