"use server";

import { and, eq, lt, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOwner } from "@/lib/auth-guard";
import {
  getAvailableSlots,
  getBusinessBySlug,
  localDateISO,
} from "@/lib/booking/get-available-slots";
import { db } from "@/lib/db";
import { bookings } from "@/lib/db/schema/booking-schema";
import { services } from "@/lib/db/schema/service-schema";
import {
  sendBookingCancelledEmails,
  sendBookingConfirmedEmails,
} from "@/lib/email/booking-notifications";
import { requireEnv } from "@/lib/env";
import { createDepositCheckout } from "@/lib/stripe";

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

/** Release expired pending holds so they stop blocking the constraint. */
async function cancelExpiredHolds(organizationId: string) {
  await db
    .update(bookings)
    .set({ status: "cancelled", cancelledAt: sql`now()` })
    .where(
      and(
        eq(bookings.organizationId, organizationId),
        eq(bookings.status, "pending"),
        lt(bookings.expiresAt, sql`now()`)
      )
    );
}

export async function createBooking(
  input: CreateBookingInput
): Promise<ActionResult> {
  const parsed = createBookingSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { slug, serviceId, customerName, customerEmail } = parsed.data;
  const startsAt = new Date(parsed.data.startsAt);

  const business = await getBusinessBySlug(slug);
  if (!business) return { error: "Business not found" };

  const service = await db.query.services.findFirst({
    where: and(
      eq(services.id, serviceId),
      eq(services.organizationId, business.organizationId),
      eq(services.active, true)
    ),
  });
  if (!service) return { error: "Service not found" };

  // Never trust the client: the requested instant must be in the freshly
  // computed availability for its local business day.
  const dateISO = localDateISO(startsAt, business.profile.timezone);
  const slots = await getAvailableSlots(business, serviceId, dateISO);
  if (!slots?.some((slot) => slot.getTime() === startsAt.getTime())) {
    return { error: "That time is no longer available — please pick another." };
  }

  await cancelExpiredHolds(business.organizationId);

  const endsAt = new Date(
    startsAt.getTime() + service.durationMinutes * 60_000
  );
  const requiresDeposit = service.depositCents != null;

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
        depositCents: service.depositCents,
        expiresAt: requiresDeposit ? new Date(Date.now() + 30 * 60_000) : null,
      })
      .returning();
  } catch (err) {
    if (isOverlapError(err)) {
      return {
        error: "That time was just taken — please pick another slot.",
      };
    }
    throw err;
  }

  if (requiresDeposit && service.depositCents != null) {
    let checkoutUrl: string;
    try {
      const session = await createDepositCheckout({
        bookingId: created.id,
        slug,
        serviceName: service.name,
        businessName: business.orgName,
        depositCents: service.depositCents,
        currency: business.profile.currency,
        customerEmail,
        appUrl: requireEnv("NEXT_PUBLIC_APP_URL"),
      });
      if (!session.url) throw new Error("Checkout session has no URL");
      checkoutUrl = session.url;
      await db
        .update(bookings)
        .set({ stripeCheckoutSessionId: session.id })
        .where(eq(bookings.id, created.id));
    } catch (err) {
      // Couldn't start payment: release the hold instead of stranding it.
      await db
        .update(bookings)
        .set({ status: "cancelled", cancelledAt: sql`now()` })
        .where(eq(bookings.id, created.id));
      console.error("Failed to create deposit checkout:", err);
      return { error: "Could not start the payment — please try again." };
    }
    return redirect(checkoutUrl);
  }

  await sendBookingConfirmedEmails(created);

  return redirect(`/b/${slug}/confirmation/${created.id}`);
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
  if (cancelled) await sendBookingCancelledEmails(cancelled);
  revalidatePath("/dashboard/bookings");
  revalidatePath("/dashboard");
}
