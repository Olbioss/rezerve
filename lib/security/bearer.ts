import { timingSafeEqual } from "node:crypto";

/**
 * A shared-secret bearer check — the renewal cron's, and the chat assistant's
 * on /api/mcp.
 *
 * Fails closed on a missing secret. An unset secret is a deployment mistake,
 * and the dangerous reading of it — "no secret configured, so let everyone
 * through" — is exactly the one to rule out.
 */
export type BearerCheck = "ok" | "unauthorized" | "misconfigured";

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  // timingSafeEqual throws on length mismatch, which would itself leak length.
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function checkBearer(
  authorizationHeader: string | null,
  secret: string | undefined
): BearerCheck {
  if (!secret) return "misconfigured";
  if (!authorizationHeader) return "unauthorized";
  return safeEqual(authorizationHeader, `Bearer ${secret}`)
    ? "ok"
    : "unauthorized";
}
