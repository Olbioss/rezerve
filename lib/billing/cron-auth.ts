import { type BearerCheck, checkBearer } from "@/lib/security/bearer";

/**
 * Bearer-token check for the renewal cron.
 *
 * Lives here rather than in the route so it can be tested: this is the only
 * thing standing between the open internet and a job that charges cards. The
 * check itself — fail-closed, constant-time — is shared with the assistant's
 * endpoint, in lib/security/bearer.ts.
 */
export type CronAuth = BearerCheck;

export function checkCronAuth(
  authorizationHeader: string | null,
  secret: string | undefined
): CronAuth {
  return checkBearer(authorizationHeader, secret);
}
