import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getBilling } from "@/lib/billing/get-billing";
import { expireHoldsForOrg } from "@/lib/booking/expire-holds";
import {
  type BusinessContext,
  getAvailableSlots,
  localDateISO,
} from "@/lib/booking/get-available-slots";
import {
  checkBookingThrottle,
  type ThrottleIdentity,
} from "@/lib/booking/throttle";
import { db } from "@/lib/db";
import { isExclusionConflict } from "@/lib/db/errors";
import { bookings } from "@/lib/db/schema/booking-schema";
import { services } from "@/lib/db/schema/service-schema";
import { sendBookingConfirmedEmails } from "@/lib/email/booking-notifications";
import { requireEnv } from "@/lib/env";
import { getPaymentProvider } from "@/lib/payments";

type Booking = typeof bookings.$inferSelect;

/** How long a held slot waits for its kapora before it is released. */
const HOLD_MINUTES = 30;

export type CreateBookingCoreInput = {
  business: BusinessContext;
  serviceId: string;
  startsAt: Date;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  /** The public booking form, or the chat assistant on a customer's behalf. */
  source: "web" | "assistant";
  /** Whose booking it is, for the assistant; null from the form. */
  customerRef: string | null;
  throttle: ThrottleIdentity;
  /** For iyzico's basket — FALLBACK_IP when the caller has no address. */
  customerIp: string;
  /**
   * The kapora the customer was shown and agreed to, null meaning "none".
   * Left undefined, nothing is compared: the booking page shows the kapora
   * on the same render it books from, so there is nothing to drift.
   */
  expectDepositCents?: number | null;
};

export type CreateBookingErrorCode =
  | "throttled"
  | "not_found"
  | "slot_unavailable"
  | "terms_changed"
  | "email_required"
  | "slot_taken"
  | "payment_start_failed";

export type CreateBookingCoreResult =
  | { ok: true; booking: Booking; checkoutUrl?: string; holdExpiresAt?: Date }
  | { ok: false; code: CreateBookingErrorCode; message: string };

function fail(
  code: CreateBookingErrorCode,
  message: string
): CreateBookingCoreResult {
  return { ok: false, code, message };
}

/**
 * Book a slot — the rules every way in shares: the booking page's server
 * action and the chat assistant's create_booking tool.
 *
 * Every check the page made before is still made here, in the same order,
 * and the database still has the last word: the exclusion constraint decides
 * a race, whoever is racing. What stays with each caller is what only it
 * knows — the page's redirect, the assistant's customer ref.
 */
export async function createBookingCore(
  input: CreateBookingCoreInput
): Promise<CreateBookingCoreResult> {
  const { business, serviceId, startsAt } = input;

  // Before the slot work, so a flood costs the database as little as
  // possible. A failed attempt still counts against the caller.
  const throttled = await checkBookingThrottle({
    organizationId: business.organizationId,
    ...input.throttle,
  });
  if (throttled) return fail("throttled", throttled);

  const service = await db.query.services.findFirst({
    where: and(
      eq(services.id, serviceId),
      eq(services.organizationId, business.organizationId),
      eq(services.active, true)
    ),
  });
  if (!service) return fail("not_found", "Hizmet bulunamadı");

  // Never trust the caller: the requested instant must be in the freshly
  // computed availability for its local business day.
  const dateISO = localDateISO(startsAt, business.profile.timezone);
  const slots = await getAvailableSlots(business, serviceId, dateISO);
  if (!slots?.some((slot) => slot.getTime() === startsAt.getTime())) {
    return fail(
      "slot_unavailable",
      "Bu saat artık müsait değil — lütfen başka bir saat seçin."
    );
  }

  await expireHoldsForOrg(business.organizationId);

  // Entitlements come straight from the business's own rows — a DB read only,
  // never an iyzico call on a booking. A stored kapora on a lapsed plan is
  // kept but not collected, so the booking follows the plan rather than the
  // service row, or it would claim a deposit nobody was ever charged.
  const billing = await getBilling(business.organizationId);
  const depositCents =
    service.depositCents != null && billing.onlineDeposit
      ? service.depositCents
      : null;

  // The customer agreed to the kapora they were shown. If the owner changed
  // it since, they agreed to something else — ask again rather than charge.
  if (
    input.expectDepositCents !== undefined &&
    input.expectDepositCents !== depositCents
  ) {
    return fail(
      "terms_changed",
      "Hizmetin kaporası değişmiş — lütfen yeniden onaylayın."
    );
  }

  // iyzico takes no payment without the buyer's email. The form always asks
  // for one; a chat customer is asked only when there is a kapora.
  let deposit: { cents: number; email: string } | null = null;
  if (depositCents != null) {
    if (!input.customerEmail) {
      return fail(
        "email_required",
        "Kapora ödemesi için e-posta adresi gerekli."
      );
    }
    deposit = { cents: depositCents, email: input.customerEmail };
  }

  const endsAt = new Date(
    startsAt.getTime() + service.durationMinutes * 60_000
  );

  let created: Booking;
  try {
    [created] = await db
      .insert(bookings)
      .values({
        organizationId: business.organizationId,
        serviceId,
        customerName: input.customerName,
        customerEmail: input.customerEmail,
        customerPhone: input.customerPhone,
        startsAt,
        endsAt,
        status: deposit ? "pending" : "confirmed",
        depositCents: deposit?.cents ?? null,
        expiresAt: deposit
          ? new Date(Date.now() + HOLD_MINUTES * 60_000)
          : null,
        source: input.source,
        customerRef: input.customerRef,
      })
      .returning();
  } catch (err) {
    // bookings_no_overlap — including the deadlock a same-instant race can
    // end in (see lib/db/errors.ts).
    if (isExclusionConflict(err)) {
      return fail(
        "slot_taken",
        "Bu saat az önce doldu — lütfen başka bir saat seçin."
      );
    }
    throw err;
  }

  if (!deposit) {
    await sendBookingConfirmedEmails(created);
    return { ok: true, booking: created };
  }

  try {
    const subMerchantKey = billing.payoutAccount?.subMerchantKey;
    if (!subMerchantKey) {
      // Unreachable in practice — onlineDeposit requires an active payout
      // account, and payout_accounts_active_has_key requires an active
      // account to carry a key. Throwing reuses the hold release below
      // rather than inventing a second failure path.
      throw new Error("Entitled for deposits but no submerchant key");
    }
    const checkout = await getPaymentProvider().createDepositCheckout({
      bookingId: created.id,
      serviceName: service.name,
      businessName: business.orgName,
      depositCents: deposit.cents,
      currency: business.profile.currency,
      customerName: input.customerName,
      customerEmail: deposit.email,
      customerIp: input.customerIp,
      subMerchantKey,
      appUrl: requireEnv("NEXT_PUBLIC_APP_URL"),
    });
    if (!checkout.paymentPageUrl) {
      throw new Error("Payment provider returned no hosted page URL");
    }
    await db
      .update(bookings)
      .set({ paymentToken: checkout.token })
      .where(eq(bookings.id, created.id));
    return {
      ok: true,
      booking: { ...created, paymentToken: checkout.token },
      checkoutUrl: checkout.paymentPageUrl,
      holdExpiresAt: created.expiresAt ?? undefined,
    };
  } catch (err) {
    // Couldn't start payment: release the hold instead of stranding it.
    await db
      .update(bookings)
      .set({ status: "cancelled", cancelledAt: sql`now()` })
      .where(eq(bookings.id, created.id));
    console.error("Failed to create deposit checkout:", err);
    return fail(
      "payment_start_failed",
      "Ödeme başlatılamadı — lütfen tekrar deneyin."
    );
  }
}
