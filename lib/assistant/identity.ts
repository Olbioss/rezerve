import type { AuthInfo } from "@modelcontextprotocol/server";
import type { BusinessContext } from "@/lib/booking/get-available-slots";

/**
 * Who the chat assistant is acting for on a request to /api/mcp.
 *
 * Both halves arrive as headers the assistant sets — never as tool
 * arguments, which the model writes. However the model is talked to, it
 * cannot name another business or another customer.
 */
export const BUSINESS_HEADER = "x-rezerve-business";
export const CUSTOMER_HEADER = "x-rezerve-customer";

/**
 * `<channel>:<26 lowercase base32 characters>` — an HMAC of the channel's
 * user id that only the assistant can compute. Never normalised: two
 * spellings of one person would split their bookings in two.
 */
const CUSTOMER_REF = /^(web|telegram|whatsapp|eval):[a-z2-7]{26}$/;

export function isCustomerRef(value: string): boolean {
  return CUSTOMER_REF.test(value);
}

export type AssistantIdentity = {
  business: BusinessContext;
  customerRef: string;
};

/** The identity request-auth.ts attached, as a tool handler receives it. */
export function identityFrom(
  authInfo: AuthInfo | undefined
): AssistantIdentity {
  const identity = authInfo?.extra?.identity as AssistantIdentity | undefined;
  if (!identity) {
    // Unreachable through the route, which authenticates first — but a tool
    // must never run as nobody, so it fails loudly rather than guessing.
    throw new Error("Assistant tool called without an authenticated identity");
  }
  return identity;
}
