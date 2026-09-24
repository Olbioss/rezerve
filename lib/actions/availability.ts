"use server";

import { and, eq, gt, gte, lt, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwner } from "@/lib/auth-guard";
import { localDateISO } from "@/lib/booking/get-available-slots";
import { db } from "@/lib/db";
import { EXCLUSION_VIOLATION, pgErrorCode } from "@/lib/db/errors";
import {
  availabilityExceptions,
  availabilityRules,
} from "@/lib/db/schema/availability-schema";
import { bookings } from "@/lib/db/schema/booking-schema";
import { localMidnight } from "@/lib/panel/week-grid";

const dayIntervalSchema = z
  .object({
    startMinutes: z.number().int().min(0).max(1439),
    endMinutes: z.number().int().min(1).max(1440),
  })
  .refine(
    (i) => i.endMinutes > i.startMinutes,
    "Bitiş, başlangıçtan sonra olmalı"
  );

const intervalSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startMinutes: z.number().int().min(0).max(1439),
    endMinutes: z.number().int().min(1).max(1440),
  })
  .refine(
    (i) => i.endMinutes > i.startMinutes,
    "Bitiş, başlangıçtan sonra olmalı"
  );

const rulesSchema = z.array(intervalSchema).max(50);

export type AvailabilityInput = z.infer<typeof rulesSchema>;
export type ActionResult = { error: string } | undefined;

/** True when two intervals within one day overlap. */
function hasOverlap(
  intervals: { startMinutes: number; endMinutes: number }[]
): boolean {
  const sorted = [...intervals].sort((a, b) => a.startMinutes - b.startMinutes);
  return sorted.some(
    (interval, i) => i > 0 && interval.startMinutes < sorted[i - 1].endMinutes
  );
}

/** Replace the business's entire weekly schedule atomically. */
export async function saveAvailability(
  input: AvailabilityInput
): Promise<ActionResult> {
  const { organizationId } = await requireOwner();
  const parsed = rulesSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz bilgi" };
  }

  // Reject overlapping intervals within the same weekday.
  for (let weekday = 0; weekday <= 6; weekday++) {
    if (hasOverlap(parsed.data.filter((rule) => rule.weekday === weekday))) {
      return { error: "Aynı gündeki aralıklar çakışamaz" };
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(availabilityRules)
      .where(eq(availabilityRules.organizationId, organizationId));
    if (parsed.data.length > 0) {
      await tx
        .insert(availabilityRules)
        .values(parsed.data.map((rule) => ({ ...rule, organizationId })));
    }
  });
  revalidatePath("/panel/saatler");
}

const MAX_EXCEPTION_DAYS = 90;

/** A real calendar date — 2026-02-30 is shaped right and still not one. */
const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Geçersiz tarih")
  .refine(
    (iso) => new Date(`${iso}T00:00:00Z`).toISOString().startsWith(iso),
    "Geçersiz tarih"
  );

/** Days in an inclusive range of ISO dates. */
function daysIn(startsOn: string, endsOn: string): number {
  const ms =
    Date.parse(`${endsOn}T00:00:00Z`) - Date.parse(`${startsOn}T00:00:00Z`);
  return ms / 86_400_000 + 1;
}

/** The ISO date after this one. */
function nextDay(iso: string): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);
}

const exceptionSchema = z
  .object({
    startsOn: isoDateSchema,
    endsOn: isoDateSchema,
    intervals: z.array(dayIntervalSchema).max(10),
    note: z
      .string()
      .trim()
      .max(80, "Not en fazla 80 karakter olabilir")
      .nullish()
      .transform((value) => value || null),
  })
  .refine((e) => e.endsOn >= e.startsOn, {
    message: "Bitiş tarihi, başlangıçtan önce olamaz",
  })
  .refine((e) => daysIn(e.startsOn, e.endsOn) <= MAX_EXCEPTION_DAYS, {
    message: `Bir özel gün en fazla ${MAX_EXCEPTION_DAYS} gün sürebilir`,
  });

export type DateExceptionInput = z.input<typeof exceptionSchema>;
export type DateExceptionResult =
  | { error: string }
  | {
      /**
       * Live bookings already inside the range. Saving an exception never
       * cancels them — that stays the owner's call, with the count in hand.
       */
      bookingsInRange: number;
    };

/**
 * Close a range of dates, or give them one-off hours: a holiday, a week
 * away, a Saturday that closes at one.
 */
export async function addDateException(
  input: DateExceptionInput
): Promise<DateExceptionResult> {
  const { organizationId, profile } = await requireOwner();
  const parsed = exceptionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz bilgi" };
  }
  const { startsOn, endsOn, intervals, note } = parsed.data;

  if (startsOn < localDateISO(new Date(), profile.timezone)) {
    return { error: "Geçmiş bir tarih seçilemez" };
  }
  if (hasOverlap(intervals)) {
    return { error: "Aynı gündeki aralıklar çakışamaz" };
  }

  try {
    await db
      .insert(availabilityExceptions)
      .values({ organizationId, startsOn, endsOn, intervals, note });
  } catch (err) {
    // availability_exceptions_no_overlap: every date answers to one exception.
    if (pgErrorCode(err) === EXCLUSION_VIOLATION) {
      return { error: "Bu tarihler kayıtlı bir özel günle çakışıyor." };
    }
    throw err;
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(bookings)
    .where(
      and(
        eq(bookings.organizationId, organizationId),
        gte(bookings.startsAt, localMidnight(startsOn, profile.timezone)),
        lt(bookings.startsAt, localMidnight(nextDay(endsOn), profile.timezone)),
        or(
          eq(bookings.status, "confirmed"),
          and(
            eq(bookings.status, "pending"),
            gt(bookings.expiresAt, sql`now()`)
          )
        )
      )
    );

  revalidatePath("/panel/saatler");
  revalidatePath("/panel");
  return { bookingsInRange: count };
}

/** Remove one of this business's exceptions; the weekly hours apply again. */
export async function deleteDateException(id: string): Promise<ActionResult> {
  const { organizationId } = await requireOwner();
  if (!z.uuid().safeParse(id).success) return { error: "Geçersiz bilgi" };
  await db
    .delete(availabilityExceptions)
    .where(
      and(
        eq(availabilityExceptions.id, id),
        eq(availabilityExceptions.organizationId, organizationId)
      )
    );
  revalidatePath("/panel/saatler");
  revalidatePath("/panel");
}
