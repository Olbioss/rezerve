import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { billingEvents } from "@/lib/db/schema/billing-schema";
import type { PaymentProvider } from "../provider";

/**
 * A deterministic stand-in for iyzico, so the whole product is walkable
 * without Marketplace/Abonelik provisioned on the merchant account.
 *
 * It simulates only the *hosted page*: a fake checkout at /demo-odeme where
 * the visitor chooses success or failure. Everything downstream is the real
 * code — the same callback routes, the same server-side re-fetch, the same
 * token-bound idempotent transitions — so what the demo proves is genuine.
 *
 * Decisions live in billing_events rather than a table of their own: it is
 * already an append-only event log keyed by reference, already indexed on
 * iyzicoRef, and this keeps demo scaffolding out of the real schema.
 */

const KIND_INIT = "fake.checkout_opened";
const KIND_DECISION = "fake.checkout_decided";
const KIND_CANCELLED = "fake.subscription_cancelled";

type Payload = {
  flow: "deposit" | "subscription";
  bookingId?: string;
  organizationId?: string;
  amountCents?: number;
  currency?: string;
  label?: string;
  callbackUrl?: string;
  paid?: boolean;
};

async function readPayload(
  token: string,
  kind: string
): Promise<Payload | null> {
  const [row] = await db
    .select()
    .from(billingEvents)
    .where(
      and(eq(billingEvents.iyzicoRef, token), eq(billingEvents.kind, kind))
    )
    .orderBy(desc(billingEvents.createdAt))
    .limit(1);
  return (row?.payload as Payload | undefined) ?? null;
}

async function writeEvent(
  token: string,
  kind: string,
  payload: Payload,
  organizationId: string | null
) {
  await db.insert(billingEvents).values({
    organizationId,
    source: "manual",
    kind,
    iyzicoRef: token,
    payload,
  });
}

/** What /demo-odeme needs to render a convincing checkout. */
export async function getFakeCheckout(token: string): Promise<Payload | null> {
  return readPayload(token, KIND_INIT);
}

/** Called by /demo-odeme when the visitor picks an outcome. */
export async function recordFakeDecision(token: string, paid: boolean) {
  const opened = await readPayload(token, KIND_INIT);
  if (!opened) throw new Error("Bilinmeyen ödeme oturumu");
  await writeEvent(
    token,
    KIND_DECISION,
    { ...opened, paid },
    opened.organizationId ?? null
  );
  return opened;
}

function token(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

export const fakeProvider: PaymentProvider = {
  name: "fake",

  async createDepositCheckout(input) {
    const t = token("fkdep");
    await writeEvent(
      t,
      KIND_INIT,
      {
        flow: "deposit",
        bookingId: input.bookingId,
        amountCents: input.depositCents,
        currency: input.currency,
        label: `${input.serviceName} — ${input.businessName}`,
        callbackUrl: `${input.appUrl}/api/odeme/iyzico`,
      },
      null
    );
    return {
      token: t,
      paymentPageUrl: `${input.appUrl}/demo-odeme?token=${t}`,
    };
  },

  async retrieveCheckout(t) {
    const decision = await readPayload(t, KIND_DECISION);
    return {
      bookingId: decision?.bookingId ?? null,
      paid: decision?.paid === true,
      paidPrice:
        decision?.amountCents != null
          ? (decision.amountCents / 100).toFixed(2)
          : null,
    };
  },

  // Submerchants have no hosted step: approval is instant and the key is
  // derived from our own external id, which keeps create idempotent.
  async createSubMerchant(input) {
    return `fake_sm_${input.subMerchantExternalId}`;
  },
  async updateSubMerchant(input) {
    return input.subMerchantKey;
  },
  async retrieveSubMerchant(externalId) {
    return `fake_sm_${externalId}`;
  },

  async initSubscriptionCheckout(input) {
    const t = token("fksub");
    await writeEvent(
      t,
      KIND_INIT,
      {
        flow: "subscription",
        organizationId: input.organizationId,
        callbackUrl: `${input.appUrl}/api/odeme/abonelik`,
      },
      input.organizationId
    );
    return {
      token: t,
      paymentPageUrl: `${input.appUrl}/demo-odeme?token=${t}`,
    };
  },

  async retrieveSubscriptionCheckout(t) {
    const decision = await readPayload(t, KIND_DECISION);
    const organizationId = decision?.organizationId ?? null;
    return {
      organizationId,
      paid: decision?.paid === true,
      subscriptionRef: organizationId ? `fake_sub_${organizationId}` : null,
      customerRef: organizationId ? `fake_cus_${organizationId}` : null,
    };
  },

  async retrieveSubscription(subscriptionRef) {
    const cancelled = await readPayload(subscriptionRef, KIND_CANCELLED);
    const monthOut = new Date(Date.now() + 30 * 86_400_000);
    return {
      status: cancelled ? "CANCELED" : "ACTIVE",
      trialEndsAt: null,
      currentPeriodEndsAt: monthOut,
    };
  },

  async updateSubscriptionCard(subscriptionRef, callbackUrl) {
    // The org id is embedded in the synthetic reference by design.
    const organizationId = subscriptionRef.replace(/^fake_sub_/, "");
    const t = token("fkcard");
    await writeEvent(
      t,
      KIND_INIT,
      { flow: "subscription", organizationId, callbackUrl },
      organizationId
    );
    const origin = new URL(callbackUrl).origin;
    return { token: t, paymentPageUrl: `${origin}/demo-odeme?token=${t}` };
  },

  async cancelSubscription(subscriptionRef) {
    await writeEvent(
      subscriptionRef,
      KIND_CANCELLED,
      { flow: "subscription" },
      null
    );
  },
};
