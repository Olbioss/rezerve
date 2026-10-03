"use server";

import { and, eq, gt, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOwner } from "@/lib/auth-guard";
import { getBilling } from "@/lib/billing/get-billing";
import {
  customerCanCancel,
  refundsDeposit,
} from "@/lib/booking/cancellation-policy";
import { clientIp, FALLBACK_IP } from "@/lib/booking/client-ip";
import { getBookingForPage } from "@/lib/booking/confirmation";
import { expireHoldsForOrg } from "@/lib/booking/expire-holds";
import {
  getAvailableSlots,
  getBusinessBySlug,
  localDateISO,
} from "@/lib/booking/get-available-slots";
import { refundDeposit } from "@/lib/booking/refund-deposit";
import { checkBookingThrottle } from "@/lib/booking/throttle";
import { db } from "@/lib/db";
import { isExclusionConflict } from "@/lib/db/errors";
import { bookings } from "@/lib/db/schema/booking-schema";
import { services } from "@/lib/db/schema/service-schema";
import {
  sendBookingCancelledEmails,
  sendBookingConfirmedEmails,
} from "@/lib/email/booking-notifications";
import { requireEnv } from "@/lib/env";
import { getPaymentProvider } from "@/lib/payments";
import { optionalPhoneSchema } from "@/lib/phone";

const createBookingSchema = z.object({
  slug: z.string().min(1),
  serviceId: z.uuid(),
  startsAt: z.iso.datetime(),
  customerName: z.string().min(2).max(80),
  customerEmail: z.email(),
  customerPhone: optionalPhoneSchema,
});

export type CreateBookingInput = z.input<typeof createBookingSchema>;
export type ActionResult = { error: string } | undefined;

/**
 * True when the insert lost the slot to another booking under
 * bookings_no_overlap — including the deadlock a same-instant race can end in.
 */
function isOverlapError(err: unknown): boolean {
  return isExclusionConflict(err);
}

export async function createBooking(
  input: CreateBookingInput
): Promise<ActionResult> {
  const parsed = createBookingSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz bilgi" };
  }
  const { slug, serviceId, customerName, customerEmail, customerPhone } =
    parsed.data;
  const startsAt = new Date(parsed.data.startsAt);

  const business = await getBusinessBySlug(slug);
  if (!business) return { error: "İşletme bulunamadı" };

  // Before the slot work, so a flood costs the database as little as
  // possible. A failed attempt still counts against the caller.
  const ip = await clientIp();
  const throttled = await checkBookingThrottle({
    organizationId: business.organizationId,
    ip,
    email: customerEmail,
  });
  if (throttled) return { error: throttled };

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
        customerPhone,
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
      const customerIp = ip ?? FALLBACK_IP;
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
    .set({ status: "cancelled", cancelledAt: sql`now()`, cancelledBy: "owner" })
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
        const customerIp = (await clientIp()) ?? FALLBACK_IP;
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

const customerCancelSchema = z.object({
  slug: z.string().min(1),
  bookingId: z.string(),
  /** What the dialog told the customer: that their kapora would come back. */
  expectRefund: z.boolean(),
});

export type CustomerCancelResult =
  | { error: string; refundWindowClosed?: true }
  | {
      cancelled: true;
      depositRefunded: boolean;
      /** Cancelled inside the last day: the business keeps the kapora. */
      depositKept: boolean;
      /** The kapora was due back, and iyzico refused or failed. */
      refundFailed: boolean;
    };

/**
 * The customer calls their own appointment off, from its page. There is no
 * account: the booking's uuid, under its own business's address, is the
 * credential — it is what the confirmation page and every email point to.
 *
 * The kapora comes back with a day's notice and stays with the business
 * after that (lib/booking/cancellation-policy.ts); either way the slot is
 * freed at once. `expectRefund` is what the dialog promised: if the deadline
 * passed while it was open, nothing is cancelled and the customer is asked
 * again rather than surprised.
 */
export async function cancelBookingAsCustomer(
  input: z.input<typeof customerCancelSchema>
): Promise<CustomerCancelResult> {
  const parsed = customerCancelSchema.safeParse(input);
  if (!parsed.success) return { error: "Geçersiz bilgi" };
  const { slug, bookingId, expectRefund } = parsed.data;

  const business = await getBusinessBySlug(slug);
  const found = business
    ? await getBookingForPage(business.organizationId, bookingId)
    : null;
  if (!business || !found) return { error: "Randevu bulunamadı." };
  const { booking } = found;

  const now = new Date();
  if (booking.status === "cancelled") {
    return { error: "Bu randevu zaten iptal edilmiş." };
  }
  if (!customerCanCancel(booking, now)) {
    return { error: "Başlamış bir randevu iptal edilemez." };
  }

  const paid =
    booking.paymentTransactionId !== null && booking.depositCents !== null;
  const refundDue = paid && refundsDeposit(booking.startsAt, now);
  if (expectRefund && paid && !refundDue) {
    return {
      error:
        "İade süresi doldu: kapora artık iade edilmiyor. Yine de iptal etmek isterseniz tekrar onaylayın.",
      refundWindowClosed: true,
    };
  }

  // Guarded like the owner's cancel, and against the appointment starting
  // between the check above and this write.
  const [cancelled] = await db
    .update(bookings)
    .set({
      status: "cancelled",
      cancelledAt: sql`now()`,
      cancelledBy: "customer",
    })
    .where(
      and(
        eq(bookings.id, booking.id),
        eq(bookings.organizationId, business.organizationId),
        sql`${bookings.status} <> 'cancelled'`,
        gt(bookings.startsAt, sql`now()`)
      )
    )
    .returning();
  if (!cancelled) return { error: "Bu randevu zaten iptal edilmiş." };

  let depositRefunded = false;
  if (refundDue) {
    try {
      const customerIp = (await clientIp()) ?? FALLBACK_IP;
      depositRefunded =
        (await refundDeposit(cancelled.id, customerIp)) === "refunded";
    } catch (err) {
      // Cancelled either way; the emails say the refund did not go through.
      console.error(`Kapora refund threw for booking ${cancelled.id}:`, err);
    }
  }
  const outcome = {
    depositKept: paid && !refundDue,
    refundFailed: refundDue && !depositRefunded,
  };

  await sendBookingCancelledEmails(cancelled, depositRefunded, {
    by: "customer",
    ...outcome,
  });
  revalidatePath("/panel/randevular");
  revalidatePath("/panel");
  return { cancelled: true, depositRefunded, ...outcome };
}
