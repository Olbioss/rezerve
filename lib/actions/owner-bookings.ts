"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwner } from "@/lib/auth-guard";
import { getDateExceptions } from "@/lib/booking/get-available-slots";
import { localInstant, withinOpeningHours } from "@/lib/booking/opening-hours";
import { db } from "@/lib/db";
import { EXCLUSION_VIOLATION, pgErrorCode } from "@/lib/db/errors";
import { availabilityRules } from "@/lib/db/schema/availability-schema";
import { bookings } from "@/lib/db/schema/booking-schema";
import { services } from "@/lib/db/schema/service-schema";
import {
  sendBookingConfirmedEmails,
  sendBookingRescheduledEmail,
} from "@/lib/email/booking-notifications";
import { optionalPhoneSchema } from "@/lib/phone";

/**
 * - `ok`: done.
 * - `outsideHours`: nothing saved — the time is outside the published hours,
 *   and the owner has to say so before it is. Send it again with
 *   `outsideHoursConfirmed`.
 * - `error`: nothing saved, and confirming will not change that.
 */
export type OwnerBookingResult =
  | { ok: true }
  | { outsideHours: true }
  | { error: string };

const OVERLAP = "Bu saatte başka bir randevu var.";

/** A business-local date and wall-clock time, as the owner typed them. */
const when = {
  dateISO: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Geçersiz tarih")
    .refine(
      (iso) => new Date(`${iso}T00:00:00Z`).toISOString().startsWith(iso),
      "Geçersiz tarih"
    ),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Geçersiz saat"),
  outsideHoursConfirmed: z.boolean().optional(),
};

function startOf(dateISO: string, time: string, timezone: string): Date {
  const [h, m] = time.split(":").map(Number);
  return localInstant(dateISO, h * 60 + m, timezone);
}

/** The weekly hours, or that date's exception, for the appointment's date. */
async function fitsOpeningHours(
  organizationId: string,
  timezone: string,
  dateISO: string,
  startsAt: Date,
  endsAt: Date
): Promise<boolean> {
  const [rules, exceptions] = await Promise.all([
    db.query.availabilityRules.findMany({
      where: eq(availabilityRules.organizationId, organizationId),
    }),
    getDateExceptions(organizationId, dateISO, dateISO),
  ]);
  return withinOpeningHours({ rules, exceptions, startsAt, endsAt, timezone });
}

const createSchema = z.object({
  serviceId: z.uuid("Hizmet seçin"),
  ...when,
  customerName: z
    .string()
    .trim()
    .min(2, "Müşteri adı en az 2 karakter olmalı")
    .max(80),
  // A phone booking may come with no email at all.
  customerEmail: z
    .email("Geçerli bir e-posta girin")
    .nullish()
    .or(z.literal("").transform(() => null)),
  customerPhone: optionalPhoneSchema,
});

/**
 * The owner books someone in — a phone call, a walk-in, a regular.
 *
 * Confirmed at once with no kapora: the owner takes any deposit in person.
 * Not held to the slot grid, and allowed outside the published hours once
 * confirmed; never allowed over another appointment, which the exclusion
 * constraint refuses whatever the owner confirms.
 */
export async function ownerCreateBooking(
  input: z.input<typeof createSchema>
): Promise<OwnerBookingResult> {
  const { organizationId, profile } = await requireOwner();
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz bilgi" };
  }
  const { serviceId, dateISO, time, outsideHoursConfirmed } = parsed.data;

  const service = await db.query.services.findFirst({
    where: and(
      eq(services.id, serviceId),
      eq(services.organizationId, organizationId),
      eq(services.active, true)
    ),
  });
  if (!service) return { error: "Hizmet bulunamadı" };

  const startsAt = startOf(dateISO, time, profile.timezone);
  if (startsAt < new Date()) {
    return { error: "Geçmiş bir saate randevu eklenemez" };
  }
  const endsAt = new Date(
    startsAt.getTime() + service.durationMinutes * 60_000
  );

  if (
    !outsideHoursConfirmed &&
    !(await fitsOpeningHours(
      organizationId,
      profile.timezone,
      dateISO,
      startsAt,
      endsAt
    ))
  ) {
    return { outsideHours: true };
  }

  let created: typeof bookings.$inferSelect;
  try {
    [created] = await db
      .insert(bookings)
      .values({
        organizationId,
        serviceId,
        customerName: parsed.data.customerName,
        customerEmail: parsed.data.customerEmail,
        customerPhone: parsed.data.customerPhone,
        startsAt,
        endsAt,
        status: "confirmed",
      })
      .returning();
  } catch (err) {
    if (pgErrorCode(err) === EXCLUSION_VIOLATION) return { error: OVERLAP };
    throw err;
  }

  await sendBookingConfirmedEmails(created, { notifyOwner: false });
  revalidatePath("/panel/randevular");
  revalidatePath("/panel");
  return { ok: true };
}

const rescheduleSchema = z.object({
  bookingId: z.uuid(),
  ...when,
});

/**
 * Move a confirmed booking to another time, keeping its length. Same rules
 * as booking someone in: outside the hours only once confirmed, never over
 * another appointment.
 */
export async function rescheduleBooking(
  input: z.input<typeof rescheduleSchema>
): Promise<OwnerBookingResult> {
  const { organizationId, profile } = await requireOwner();
  const parsed = rescheduleSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz bilgi" };
  }
  const { bookingId, dateISO, time, outsideHoursConfirmed } = parsed.data;

  const booking = await db.query.bookings.findFirst({
    where: and(
      eq(bookings.id, bookingId),
      eq(bookings.organizationId, organizationId)
    ),
  });
  if (!booking) return { error: "Randevu bulunamadı" };
  if (booking.status === "cancelled") {
    return { error: "İptal edilmiş bir randevu taşınamaz" };
  }
  if (booking.status === "pending") {
    // Its hold and its payment page both belong to the time the customer chose.
    return { error: "Kaporası beklenen bir randevu taşınamaz" };
  }

  const startsAt = startOf(dateISO, time, profile.timezone);
  if (startsAt < new Date()) {
    return { error: "Geçmiş bir saate taşınamaz" };
  }
  if (startsAt.getTime() === booking.startsAt.getTime()) return { ok: true };
  const endsAt = new Date(
    startsAt.getTime() + (booking.endsAt.getTime() - booking.startsAt.getTime())
  );

  if (
    !outsideHoursConfirmed &&
    !(await fitsOpeningHours(
      organizationId,
      profile.timezone,
      dateISO,
      startsAt,
      endsAt
    ))
  ) {
    return { outsideHours: true };
  }

  let moved: typeof bookings.$inferSelect | undefined;
  try {
    [moved] = await db
      .update(bookings)
      .set({ startsAt, endsAt })
      .where(
        and(
          eq(bookings.id, bookingId),
          eq(bookings.organizationId, organizationId),
          eq(bookings.status, "confirmed")
        )
      )
      .returning();
  } catch (err) {
    if (pgErrorCode(err) === EXCLUSION_VIOLATION) return { error: OVERLAP };
    throw err;
  }
  // Cancelled between the read and the write.
  if (!moved) return { error: "Randevu bulunamadı" };

  await sendBookingRescheduledEmail(moved, booking.startsAt);
  revalidatePath("/panel/randevular");
  revalidatePath("/panel");
  return { ok: true };
}
