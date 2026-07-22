import "server-only";
import Stripe from "stripe";
import { requireEnv } from "@/lib/env";

let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (!client) {
    client = new Stripe(requireEnv("STRIPE_SECRET_KEY"));
  }
  return client;
}

export type DepositCheckoutInput = {
  bookingId: string;
  slug: string;
  serviceName: string;
  businessName: string;
  depositCents: number;
  currency: string;
  customerEmail: string;
  /** Absolute origin, e.g. https://rezerve.example.com */
  appUrl: string;
};

/**
 * Checkout Session for a booking deposit. Expires in 30 minutes to match the
 * pending hold's expires_at; metadata.bookingId links the webhook back.
 */
export async function createDepositCheckout(input: DepositCheckoutInput) {
  const stripe = getStripe();
  return stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: input.customerEmail,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: input.currency,
          unit_amount: input.depositCents,
          product_data: {
            name: `Kapora — ${input.serviceName}, ${input.businessName}`,
          },
        },
      },
    ],
    metadata: { bookingId: input.bookingId },
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    success_url: `${input.appUrl}/r/${input.slug}/onay/${input.bookingId}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${input.appUrl}/r/${input.slug}`,
  });
}
