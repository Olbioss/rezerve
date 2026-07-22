"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwner } from "@/lib/auth-guard";
import { db } from "@/lib/db";
import { availabilityRules } from "@/lib/db/schema/availability-schema";

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
  const byDay = new Map<
    number,
    { startMinutes: number; endMinutes: number }[]
  >();
  for (const rule of parsed.data) {
    const day = byDay.get(rule.weekday) ?? [];
    day.push(rule);
    byDay.set(rule.weekday, day);
  }
  for (const intervals of byDay.values()) {
    intervals.sort((a, b) => a.startMinutes - b.startMinutes);
    for (let i = 1; i < intervals.length; i++) {
      if (intervals[i].startMinutes < intervals[i - 1].endMinutes) {
        return { error: "Aynı gündeki aralıklar çakışamaz" };
      }
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
