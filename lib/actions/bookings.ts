"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOwner } from "@/lib/auth-guard";
import { getBilling } from "@/lib/billing/get-billing";
import { expireHoldsForOrg } from "@/lib/booking/expire-holds";
import {
  getAvailableSlots,
  getBusinessBySlug,
  localDateISO,
} from "@/lib/booking/get-available-slots";
import { refundDeposit } from "@/lib/booking/refund-deposit";
import { db } from "@/lib/db";
import { bookings } from "@/lib/db/schema/booking-schema";
import { services } from "@/lib/db/schema/service-schema";
import {
  sendBookingCancelledEmails,
  sendBookingConfirmedEmails,
} from "@/lib/email/booking-notifications";
import { requireEnv } from "@/lib/env";
import { getPaymentProvider } from "@/lib/payments";

const createBookingSchema = z.object({
  slug: z.string().min(1),
  serviceId: z.uuid(),
  startsAt: z.iso.datetime(),
  customerName: z.string().min(2).max(80),
  customerEmail: z.email(),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type ActionResult = { error: string } | undefined;

/** True when the error is the bookings_no_overlap exclusion violation. */
function isOverlapError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code =
    (err as { code?: string }).code ??
    ((err as { cause?: { code?: string } }).cause?.code as string | undefined);
  return code === "23P01";
}

export async function createBooking(
  input: CreateBookingInput
): Promise<ActionResult> {
  const parsed = createBookingSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz bilgi" };
  }
  const { slug, serviceId, customerName, customerEmail } = parsed.data;
  const startsAt = new Date(parsed.data.startsAt);

  const business = await getBusinessBySlug(slug);
  if (!business) return { error: "İşletme bulunamadı" };

  const service = await db.query.services.findFirst({
    where: and(
      eq(services.id, serviceId),
      eq(services.organizationId, business.organizationId),
      eq(services.active, true)
    ),
  });
  if (!service) return { error: "Hizmet bulunamadı" };

  // Never trust the client: the requested instant must be in the freshly
  // computed availability for its local business day.
  const dateISO = localDateISO(startsAt, business.profile.timezone);
  const slots = await getAvailableSlots(business, serviceId, dateISO);
  if (!slots?.some((slot) => slot.getTime() === startsAt.getTime())) {
    return {
      error: "Bu saat artık müsait değil — lütfen başka bir saat seçin.",
    };
  }

  await expireHoldsForOrg(business.organizationId);

  // Public path — no requireOwner() here, so entitlements come straight from
  // the business's own rows. A DB read only: never poll iyzico on a booking.
  const billing = await getBilling(business.organizationId);

  const endsAt = new Date(
    startsAt.getTime() + service.durationMinutes * 60_000
  );
  // A stored kapora on a lapsed plan is kept but not collected, so the
  // snapshot below must follow this flag rather than the service row —
  // otherwise the booking claims a deposit nobody was ever charged.
  const requiresDeposit = service.depositCents != null && billing.onlineDeposit;

  let created: typeof bookings.$inferSelect;
  try {
    [created] = await db
      .insert(bookings)
      .values({
        organizationId: business.organizationId,
        serviceId,
        customerName,
        customerEmail,
        startsAt,
        endsAt,
        status: requiresDeposit ? "pending" : "confirmed",
        depositCents: requiresDeposit ? service.depositCents : null,
        expiresAt: requiresDeposit ? new Date(Date.now() + 30 * 60_000) : null,
      })
      .returning();
  } catch (err) {
    if (isOverlapError(err)) {
      return {
        error: "Bu saat az önce doldu — lütfen başka bir saat seçin.",
      };
    }
    throw err;
  }

  if (requiresDeposit && service.depositCents != null) {
    let checkoutUrl: string;
    try {
      const subMerchantKey = billing.payoutAccount?.subMerchantKey;
      if (!subMerchantKey) {
        // Unreachable in practice — onlineDeposit requires an active payout
        // account, and payout_accounts_active_has_key requires an active
        // account to carry a key. Throwing reuses the hold release below
        // rather than inventing a second failure path.
        throw new Error("Entitled for deposits but no submerchant key");
      }
      const requestHeaders = await headers();
      const customerIp =
        requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        "85.34.78.112";
      const checkout = await getPaymentProvider().createDepositCheckout({
        bookingId: created.id,
        serviceName: service.name,
        businessName: business.orgName,
        depositCents: service.depositCents,
        currency: business.profile.currency,
        customerName,
        customerEmail,
        customerIp,
        subMerchantKey,
        appUrl: requireEnv("NEXT_PUBLIC_APP_URL"),
      });
      if (!checkout.paymentPageUrl) {
        throw new Error("Payment provider returned no hosted page URL");
      }
      checkoutUrl = checkout.paymentPageUrl;
      await db
        .update(bookings)
        .set({ paymentToken: checkout.token })
        .where(eq(bookings.id, created.id));
    } catch (err) {
      // Couldn't start payment: release the hold instead of stranding it.
      await db
        .update(bookings)
        .set({ status: "cancelled", cancelledAt: sql`now()` })
        .where(eq(bookings.id, created.id));
      console.error("Failed to create deposit checkout:", err);
      return { error: "Ödeme başlatılamadı — lütfen tekrar deneyin." };
    }
    return redirect(checkoutUrl);
  }

  await sendBookingConfirmedEmails(created);

  return redirect(`/r/${slug}/onay/${created.id}`);
}

export async function cancelBooking(id: string): Promise<void> {
  const { organizationId } = await requireOwner();
  const [cancelled] = await db
    .update(bookings)
    .set({ status: "cancelled", cancelledAt: sql`now()` })
    .where(
      and(
        eq(bookings.id, id),
        eq(bookings.organizationId, organizationId),
        sql`${bookings.status} <> 'cancelled'`
      )
    )
    .returning();
  if (cancelled) {
    // The business called this off, so the customer's kapora goes back. Their
    // email says so, which is the only way they would know.
    let refunded = false;
    if (cancelled.paymentTransactionId && cancelled.depositCents != null) {
      try {
        const requestHeaders = await headers();
        const customerIp =
          requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          "85.34.78.112";
        refunded =
          (await refundDeposit(cancelled.id, customerIp)) === "refunded";
      } catch (err) {
        // The appointment is already cancelled and this email is the only way
        // the customer finds out. A refund that blows up must not swallow it.
        console.error(`Kapora refund threw for booking ${cancelled.id}:`, err);
      }
    }
    await sendBookingCancelledEmails(cancelled, refunded);
  }
  revalidatePath("/panel/randevular");
  revalidatePath("/panel");
}
