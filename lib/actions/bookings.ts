"use server";

import { and, eq, gt, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOwner } from "@/lib/auth-guard";
import {
  customerCanCancel,
  refundsDeposit,
} from "@/lib/booking/cancellation-policy";
import { clientIp, FALLBACK_IP } from "@/lib/booking/client-ip";
import {
  confirmationPath,
  getBookingForPage,
} from "@/lib/booking/confirmation";
import { createBookingCore } from "@/lib/booking/create-booking-core";
import { getBusinessBySlug } from "@/lib/booking/get-available-slots";
import { refundDeposit } from "@/lib/booking/refund-deposit";
import { db } from "@/lib/db";
import { bookings } from "@/lib/db/schema/booking-schema";
import { sendBookingCancelledEmails } from "@/lib/email/booking-notifications";
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

export async function createBooking(
  input: CreateBookingInput
): Promise<ActionResult> {
  const parsed = createBookingSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz bilgi" };
  }
  const { slug, serviceId, customerName, customerEmail, customerPhone } =
    parsed.data;

  const business = await getBusinessBySlug(slug);
  if (!business) return { error: "İşletme bulunamadı" };

  const ip = await clientIp();
  const result = await createBookingCore({
    business,
    serviceId,
    startsAt: new Date(parsed.data.startsAt),
    customerName,
    customerEmail,
    customerPhone,
    source: "web",
    customerRef: null,
    throttle: { ip, email: customerEmail },
    customerIp: ip ?? FALLBACK_IP,
  });
  if (!result.ok) return { error: result.message };

  // Outside any try: redirect() works by throwing.
  return redirect(
    result.checkoutUrl ?? confirmationPath(slug, result.booking.id)
  );
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
