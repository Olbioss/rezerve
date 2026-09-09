"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOwner } from "@/lib/auth-guard";
import { applySubscriptionState } from "@/lib/billing/sync-subscription";
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
import { requireEnv } from "@/lib/env";
import { getPaymentProvider } from "@/lib/payments";
import type { SubMerchantInput } from "@/lib/payments/provider";

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
 * Open a Pro subscription checkout.
 *
 * The row is marked `pending` with the checkout token *before* the visitor
 * leaves, so the callback has something to match against — the same
 * token-bound idempotency the booking deposit flow uses.
 *
 * Returns form HTML only when the provider gives an embeddable blob instead
 * of a hosted URL; otherwise it redirects and never returns.
 */
export async function startProSubscription(): Promise<
  ActionResult | { formContent: string }
> {
  const { organizationId, session, billing } = await requireOwner();
  if (billing.plan === "pro") {
    return { error: "Aboneliğiniz zaten aktif." };
  }

  const appUrl = requireEnv("NEXT_PUBLIC_APP_URL");
  let checkout: Awaited<
    ReturnType<
      ReturnType<typeof getPaymentProvider>["initSubscriptionCheckout"]
    >
  >;
  try {
    checkout = await getPaymentProvider().initSubscriptionCheckout({
      organizationId,
      customerName: session.user.name ?? session.user.email,
      customerEmail: session.user.email,
      appUrl,
    });
  } catch (err) {
    console.error("Failed to start subscription checkout:", err);
    return { error: "Ödeme başlatılamadı — lütfen tekrar deneyin." };
  }

  await db
    .insert(orgSubscriptions)
    .values({
      organizationId,
      status: "pending",
      checkoutToken: checkout.token,
    })
    .onConflictDoUpdate({
      target: orgSubscriptions.organizationId,
      set: { status: "pending", checkoutToken: checkout.token },
    });

  if (checkout.paymentPageUrl) redirect(checkout.paymentPageUrl);
  if (checkout.checkoutFormContent) {
    return { formContent: checkout.checkoutFormContent };
  }
  return { error: "Ödeme sayfası alınamadı — lütfen tekrar deneyin." };
}

/**
 * Cancel at iyzico, then take the provider's own end date as truth rather
 * than assuming whether the paid period is served out — the entitlement rule
 * ("cancelled but not yet lapsed still counts") then matches reality.
 */
export async function cancelProSubscription(): Promise<ActionResult> {
  const { organizationId, billing } = await requireOwner();
  const ref = billing.subscription?.iyzicoSubscriptionRef;
  if (!ref) return { error: "Aktif abonelik bulunamadı." };

  const payments = getPaymentProvider();
  try {
    await payments.cancelSubscription(ref);
    const state = await payments.retrieveSubscription(ref);
    await applySubscriptionState(organizationId, state, "manual");
  } catch (err) {
    console.error("Failed to cancel subscription:", err);
    return { error: "Abonelik iptal edilemedi — lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/abonelik");
}

/**
 * Re-collect card details after a failed renewal. This is the difference
 * between a billing page and a billing system: past_due otherwise has no way
 * out except cancelling and re-subscribing.
 */
export async function updateSubscriptionCard(): Promise<
  ActionResult | { formContent: string }
> {
  const { billing } = await requireOwner();
  const ref = billing.subscription?.iyzicoSubscriptionRef;
  if (!ref) return { error: "Aktif abonelik bulunamadı." };

  const appUrl = requireEnv("NEXT_PUBLIC_APP_URL");
  let checkout: Awaited<
    ReturnType<ReturnType<typeof getPaymentProvider>["updateSubscriptionCard"]>
  >;
  try {
    checkout = await getPaymentProvider().updateSubscriptionCard(
      ref,
      `${appUrl}/api/odeme/abonelik`
    );
  } catch (err) {
    console.error("Failed to start card update:", err);
    return { error: "Kart güncelleme başlatılamadı — lütfen tekrar deneyin." };
  }

  if (checkout.paymentPageUrl) redirect(checkout.paymentPageUrl);
  if (checkout.checkoutFormContent) {
    return { formContent: checkout.checkoutFormContent };
  }
  return { error: "Ödeme sayfası alınamadı — lütfen tekrar deneyin." };
}
