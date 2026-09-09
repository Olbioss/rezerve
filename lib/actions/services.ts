"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwner } from "@/lib/auth-guard";
import { db } from "@/lib/db";
import { services } from "@/lib/db/schema/service-schema";

const serviceSchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(500).nullable(),
  durationMinutes: z.number().int().min(5).max(600),
  priceCents: z.number().int().min(0).max(10_000_000),
  depositCents: z.number().int().min(1).max(10_000_000).nullable(),
  active: z.boolean(),
});

export type ServiceInput = z.infer<typeof serviceSchema>;
export type ActionResult = { error: string } | undefined;

const DEPOSIT_LOCKED =
  "Online kapora Pro planına özel. Pro'ya geçtiğinizde kapora ekleyebilirsiniz.";

export async function createService(
  input: ServiceInput
): Promise<ActionResult> {
  const { organizationId, billing } = await requireOwner();
  const parsed = serviceSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz bilgi" };
  }
  if (parsed.data.depositCents !== null && !billing.onlineDeposit) {
    return { error: DEPOSIT_LOCKED };
  }
  if (
    parsed.data.depositCents !== null &&
    parsed.data.depositCents > parsed.data.priceCents
  ) {
    return { error: "Kapora fiyattan büyük olamaz" };
  }
  await db.insert(services).values({ ...parsed.data, organizationId });
  revalidatePath("/panel/hizmetler");
}

export async function updateService(
  id: string,
  input: ServiceInput
): Promise<ActionResult> {
  const { organizationId, billing } = await requireOwner();
  const parsed = serviceSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz bilgi" };
  }
  if (
    parsed.data.depositCents !== null &&
    parsed.data.depositCents > parsed.data.priceCents
  ) {
    return { error: "Kapora fiyattan büyük olamaz" };
  }
  // A downgraded owner keeps their stored kapora amounts and must still be
  // able to rename or reprice the service — so gate only *introducing* or
  // *raising* a deposit, never merely carrying one forward.
  if (parsed.data.depositCents !== null && !billing.onlineDeposit) {
    const existing = await db.query.services.findFirst({
      where: and(
        eq(services.id, id),
        eq(services.organizationId, organizationId)
      ),
    });
    if (!existing) return { error: "Hizmet bulunamadı" };
    if (
      existing.depositCents === null ||
      parsed.data.depositCents > existing.depositCents
    ) {
      return { error: DEPOSIT_LOCKED };
    }
  }
  await db
    .update(services)
    .set(parsed.data)
    .where(
      and(eq(services.id, id), eq(services.organizationId, organizationId))
    );
  revalidatePath("/panel/hizmetler");
}

export async function deleteService(id: string): Promise<ActionResult> {
  const { organizationId } = await requireOwner();
  try {
    await db
      .delete(services)
      .where(
        and(eq(services.id, id), eq(services.organizationId, organizationId))
      );
  } catch {
    // FK restrict: the service has bookings — deactivate instead.
    await db
      .update(services)
      .set({ active: false })
      .where(
        and(eq(services.id, id), eq(services.organizationId, organizationId))
      );
    revalidatePath("/panel/hizmetler");
    return {
      error: "Hizmetin randevuları olduğu için silinmek yerine pasife alındı.",
    };
  }
  revalidatePath("/panel/hizmetler");
}
