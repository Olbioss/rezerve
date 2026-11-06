import { createHmac } from "node:crypto";

/**
 * Events Rezerve sends the chat assistant (spec §6.5), to `POST
 * /events/rezerve`. Each is signed with HMAC-SHA256 over "<timestamp>.<body>"
 * under ASSISTANT_EVENT_SECRET, and the assistant refuses one outside five
 * minutes of its timestamp.
 *
 * Best effort: one attempt, a failure logged and swallowed. The confirmation
 * page and email have already told the customer.
 */

/** A kapora paid: Rezerve confirmed a booking the assistant made. */
export type BookingConfirmedEvent = {
  type: "booking.confirmed";
  booking_id: string;
  business_slug: string;
  customer_ref: string;
  service_name: string;
  /** "Cumartesi 17 Ekim 15:30", in the business's timezone (localLabel). */
  local_label: string;
};

/** What goes in X-Rezerve-Signature. */
export function eventSignature(
  secret: string,
  timestamp: string,
  body: string
): string {
  const digest = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return `sha256=${digest}`;
}

export async function notifyAssistant(
  event: BookingConfirmedEvent
): Promise<void> {
  const url = process.env.ASSISTANT_URL;
  const secret = process.env.ASSISTANT_EVENT_SECRET;
  if (!url || !secret) return;

  const body = JSON.stringify(event);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const what = `Assistant event ${event.type} for booking ${event.booking_id}`;
  try {
    const response = await fetch(new URL("/events/rezerve", url), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-rezerve-timestamp": timestamp,
        "x-rezerve-signature": eventSignature(secret, timestamp, body),
      },
      body,
      // A cold start on Cloud Run takes seconds; the event is not worth more.
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) console.error(`${what}: HTTP ${response.status}`);
  } catch (err) {
    console.error(`${what}: not delivered`, err);
  }
}
