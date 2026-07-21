import { and, eq, sql } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { bookings } from "@/lib/db/schema/booking-schema";
import { sendBookingConfirmedEmails } from "@/lib/email/booking-notifications";

/**
 * Webhook business logic, separated from signature verification for testing.
 *
 * Idempotent by construction: both transitions are guarded UPDATEs on
 * status='pending', so duplicate deliveries and out-of-order events match
 * zero rows and do nothing (no second email, no state clobbering).
 */
export async function handleWebhookEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const bookingId = event.data.object.metadata?.bookingId;
      if (!bookingId) return;
      const [confirmed] = await db
        .update(bookings)
        .set({ status: "confirmed", expiresAt: null })
        .where(and(eq(bookings.id, bookingId), eq(bookings.status, "pending")))
        .returning();
      if (confirmed) await sendBookingConfirmedEmails(confirmed);
      return;
    }
    case "checkout.session.expired": {
      const bookingId = event.data.object.metadata?.bookingId;
      if (!bookingId) return;
      // Release the hold immediately; no email for an abandoned checkout.
      await db
        .update(bookings)
        .set({ status: "cancelled", cancelledAt: sql`now()` })
        .where(and(eq(bookings.id, bookingId), eq(bookings.status, "pending")));
      return;
    }
    default:
      return;
  }
}
