import { DEMO_ACCOUNTS, DEMO_EVAL } from "@/lib/demo/credentials";

/**
 * Where to tell a business about a booking: its contact address, else its
 * owner's login — except for the demo businesses and the eval business,
 * which have nobody.
 *
 * Their logins sit on rezerve.app, a domain this project does not own.
 * Mailing "the owner" about every visitor's booking — or every eval run's —
 * would send mail to a stranger's domain, and each bounce would count against
 * the sender. Customers still get their own emails; a visitor who books the
 * demo sees the confirmation a real customer would.
 */
const UNMAILED_ORGS = new Set(
  [...DEMO_ACCOUNTS, DEMO_EVAL].map((demo) => demo.orgId)
);

export function ownerNotificationAddress({
  organizationId,
  contactEmail,
  loginEmail,
}: {
  organizationId: string;
  contactEmail: string | null;
  loginEmail: string | null | undefined;
}): string | null {
  if (UNMAILED_ORGS.has(organizationId)) return null;
  return contactEmail ?? loginEmail ?? null;
}
