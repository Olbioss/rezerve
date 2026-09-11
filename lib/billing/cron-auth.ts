import { timingSafeEqual } from "node:crypto";

/**
 * Bearer-token check for the renewal cron.
 *
 * Lives here rather than in the route so it can be tested: this is the only
 * thing standing between the open internet and a job that charges cards.
 *
 * Fails closed on a missing secret. An unset CRON_SECRET is a deployment
 * mistake, and the dangerous reading of it — "no secret configured, so let
 * everyone through" — is exactly the one to rule out.
 */
export type CronAuth = "ok" | "unauthorized" | "misconfigured";

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  // timingSafeEqual throws on length mismatch, which would itself leak length.
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function checkCronAuth(
  authorizationHeader: string | null,
  secret: string | undefined
): CronAuth {
  if (!secret) return "misconfigured";
  if (!authorizationHeader) return "unauthorized";
  return safeEqual(authorizationHeader, `Bearer ${secret}`)
    ? "ok"
    : "unauthorized";
}
