"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { requireOwner } from "@/lib/auth-guard";
import { activateSubscription } from "@/lib/billing/activate-subscription";
import { PRO_PRICE_CENTS, TRIAL_DAYS } from "@/lib/billing/plans";
import {
  gsmSchema,
  ibanSchema,
  tcknSchema,
  vknSchema,
} from "@/lib/billing/validators";
import { db } from "@/lib/db";
import {
  orgPayoutAccounts,
  orgSubscriptions,
} from "@/lib/db/schema/billing-schema";
import { getPaymentProvider } from "@/lib/payments";
import type {
  PaymentProvider,
  SubMerchantInput,
} from "@/lib/payments/provider";

export type ActionResult = { error: string } | undefined;

const common = {
  name: z
    .string()
    .trim()
    .min(2, "İşletme adı en az 2 karakter olmalı")
    .max(120),
  email: z.email("Geçerli bir e-posta girin"),
  gsmNumber: gsmSchema,
  address: z.string().trim().min(10, "Açık adres girin").max(300),
  iban: ibanSchema,
};

const companyFields = {
  legalCompanyTitle: z.string().trim().min(2, "Şirket ünvanını girin").max(160),
  taxOffice: z.string().trim().min(2, "Vergi dairesini girin").max(80),
};

/**
 * iyzico wants a different field set per submerchant type — TCKN for people
 * and şahıs şirketi, vergi no for limited/anonim şirket. A discriminated
 * union keeps "which fields are required" in one place.
 */
const payoutSchema = z.discriminatedUnion("merchantType", [
  z.object({
    merchantType: z.literal("personal"),
    ...common,
    contactName: z.string().trim().min(2, "Ad girin").max(80),
    contactSurname: z.string().trim().min(2, "Soyad girin").max(80),
    identityNumber: tcknSchema,
  }),
  z.object({
    merchantType: z.literal("private_company"),
    ...common,
    ...companyFields,
    identityNumber: tcknSchema,
  }),
  z.object({
    merchantType: z.literal("limited_or_joint_stock_company"),
    ...common,
    ...companyFields,
    taxNumber: vknSchema,
  }),
]);

export type PayoutAccountInput = z.input<typeof payoutSchema>;
type PayoutAccountData = z.output<typeof payoutSchema>;

function toSubMerchantInput(
  organizationId: string,
  data: PayoutAccountData
): SubMerchantInput {
  return {
    subMerchantExternalId: organizationId,
    merchantType: data.merchantType,
    name: data.name,
    email: data.email,
    gsmNumber: data.gsmNumber,
    address: data.address,
    iban: data.iban,
    legalCompanyTitle:
      "legalCompanyTitle" in data ? data.legalCompanyTitle : null,
    taxOffice: "taxOffice" in data ? data.taxOffice : null,
    contactName: "contactName" in data ? data.contactName : null,
    contactSurname: "contactSurname" in data ? data.contactSurname : null,
    identityNumber: "identityNumber" in data ? data.identityNumber : null,
    taxNumber: "taxNumber" in data ? data.taxNumber : null,
  };
}

/**
 * Create or update the org's iyzico submerchant — the account its customers'
 * kapora settles into.
 *
 * The row is written as `pending` *before* iyzico is called, because
 * subMerchant.create is not retry-safe: if we crash after iyzico accepts but
 * before the key is stored, a naive retry fails with "already exists" and the
 * org is stranded. Keying on subMerchantExternalId (= the organization id)
 * makes the key recoverable instead.
 */
export async function savePayoutAccount(
  input: PayoutAccountInput
): Promise<ActionResult> {
  const { organizationId, billing } = await requireOwner();
  if (billing.plan !== "pro") {
    return {
      error: "Ödeme hesabı tanımlamak için Pro aboneliği gerekiyor.",
    };
  }

  const parsed = payoutSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz bilgi" };
  }
  const data = parsed.data;

  const columns = {
    merchantType: data.merchantType,
    name: data.name,
    email: data.email,
    gsmNumber: data.gsmNumber,
    address: data.address,
    iban: data.iban,
    legalCompanyTitle:
      "legalCompanyTitle" in data ? data.legalCompanyTitle : null,
    taxOffice: "taxOffice" in data ? data.taxOffice : null,
    contactName: "contactName" in data ? data.contactName : null,
    contactSurname: "contactSurname" in data ? data.contactSurname : null,
    identityNumber: "identityNumber" in data ? data.identityNumber : null,
    taxNumber: "taxNumber" in data ? data.taxNumber : null,
  };

  await db
    .insert(orgPayoutAccounts)
    .values({
      organizationId,
      subMerchantExternalId: organizationId,
      status: "pending",
      ...columns,
    })
    .onConflictDoUpdate({
      target: orgPayoutAccounts.organizationId,
      // subMerchantKey is deliberately not reset: it's how we recover.
      set: { status: "pending", lastError: null, ...columns },
    });

  const existing = await db.query.orgPayoutAccounts.findFirst({
    where: eq(orgPayoutAccounts.organizationId, organizationId),
  });
  const sdkInput = toSubMerchantInput(organizationId, data);
  const payments = getPaymentProvider();

  let subMerchantKey: string;
  try {
    if (existing?.subMerchantKey) {
      subMerchantKey = await payments.updateSubMerchant({
        ...sdkInput,
        subMerchantKey: existing.subMerchantKey,
      });
    } else {
      try {
        subMerchantKey = await payments.createSubMerchant(sdkInput);
      } catch (createErr) {
        // Create may have succeeded on an earlier, half-finished attempt.
        const recovered = await payments.retrieveSubMerchant(organizationId);
        if (!recovered) throw createErr;
        subMerchantKey = await payments.updateSubMerchant({
          ...sdkInput,
          subMerchantKey: recovered,
        });
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata";
    console.error("Failed to save payout account:", err);
    await db
      .update(orgPayoutAccounts)
      .set({ status: "rejected", lastError: message })
      .where(eq(orgPayoutAccounts.organizationId, organizationId));
    return {
      error:
        "Ödeme hesabı oluşturulamadı — bilgileri kontrol edip tekrar deneyin.",
    };
  }

  await db
    .update(orgPayoutAccounts)
    .set({ status: "active", subMerchantKey, lastError: null })
    .where(eq(orgPayoutAccounts.organizationId, organizationId));

  revalidatePath("/panel/abonelik");
  revalidatePath("/panel/hizmetler");
}

/**
 * Start the free trial — no card, no payment.
 *
 * Capturing a card requires a payment on this account (iyzico has no
 * card-storage-without-payment here: /v2/ucs/init returns 42205), so a trial
 * that took a card would have to charge for it. The trial therefore grants
 * Pro outright and lapses to free at the end unless the owner subscribes,
 * which also makes "kredi kartı gerekmez" literally true.
 */
export async function startTrial(): Promise<ActionResult> {
  const { organizationId, billing } = await requireOwner();
  if (billing.subscription) {
    return { error: "Deneme hakkınızı zaten kullandınız." };
  }

  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86_400_000);
  await db.insert(orgSubscriptions).values({
    organizationId,
    plan: "pro",
    status: "trialing",
    trialEndsAt,
    currentPeriodEndsAt: trialEndsAt,
    // The cron picks this up at trial end and lapses it (no card to charge).
    nextChargeAt: trialEndsAt,
  });

  revalidatePath("/panel/abonelik");
  revalidatePath("/panel/hizmetler");
}

const cardSchema = z.object({
  holderName: z.string().trim().min(3, "Kart üzerindeki ismi girin").max(80),
  number: z
    .string()
    .transform((v) => v.replace(/\s+/g, ""))
    .refine((v) => /^\d{15,16}$/.test(v), "Geçerli bir kart numarası girin"),
  expireMonth: z
    .string()
    .trim()
    .refine((v) => /^(0[1-9]|1[0-2])$/.test(v), "Ay 01-12 olmalı"),
  expireYear: z
    .string()
    .trim()
    .refine((v) => /^\d{4}$/.test(v), "Yılı 4 haneli girin (örn. 2030)"),
  cvc: z
    .string()
    .trim()
    .refine((v) => /^\d{3,4}$/.test(v), "Geçerli bir CVC girin"),
});

export type CardInput = z.input<typeof cardSchema>;

/**
 * Start Pro: charge the card now and keep it for renewals.
 *
 * iyzico offers no hosted way to store a card on a marketplace account, and
 * directs recurring billing through card storage on the direct API — so the
 * number is posted here, passed straight to iyzico, and never logged or
 * persisted. Only the token it returns is kept.
 *
 * Also the card-update path: paying again replaces the stored mandate.
 */
export async function startProSubscription(
  input: CardInput
): Promise<ActionResult> {
  const { organizationId, session } = await requireOwner();

  const parsed = cardSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Geçersiz kart bilgisi",
    };
  }

  const requestHeaders = await headers();
  const customerIp =
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "85.34.78.112";

  let result: Awaited<ReturnType<PaymentProvider["chargeNewCard"]>>;
  try {
    result = await getPaymentProvider().chargeNewCard({
      organizationId,
      amountCents: PRO_PRICE_CENTS,
      customerName: session.user.name ?? session.user.email,
      customerEmail: session.user.email,
      customerIp,
      label: "Rezerve Pro — aylık abonelik",
      card: parsed.data,
    });
  } catch (err) {
    console.error("Subscription payment failed:", err);
    return { error: "Ödeme alınamadı — lütfen tekrar deneyin." };
  }

  if (!result.paid) {
    return { error: result.errorMessage ?? "Kartınızdan ödeme alınamadı." };
  }

  await activateSubscription(organizationId, result);

  revalidatePath("/panel/abonelik");
  revalidatePath("/panel/hizmetler");
}

/**
 * Cancel: stop renewing, but serve out the period already paid for.
 *
 * There is nothing to cancel upstream — Rezerve owns the schedule, so
 * clearing nextChargeAt *is* the cancellation. The entitlement rule
 * ("cancelled but not yet lapsed still counts") then does the rest.
 */
export async function cancelProSubscription(): Promise<ActionResult> {
  const { organizationId, billing } = await requireOwner();
  if (billing.plan !== "pro") return { error: "Aktif abonelik bulunamadı." };

  await db
    .update(orgSubscriptions)
    .set({ status: "cancelled", cancelAtPeriodEnd: true, nextChargeAt: null })
    .where(eq(orgSubscriptions.organizationId, organizationId));

  revalidatePath("/panel/abonelik");
  revalidatePath("/panel/hizmetler");
}

export async function updateSubscriptionCard(
  input: CardInput
): Promise<ActionResult> {
  // Paying again stores the new card, which replaces the mandate.
  return startProSubscription(input);
}
