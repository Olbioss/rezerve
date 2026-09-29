import { DEMO_ACCOUNTS } from "@/lib/demo/credentials";

/**
 * Where to tell a business about a booking: its contact address, else its
 * owner's login — except for the two demo businesses, which have nobody.
 *
 * Their logins are published and sit on rezerve.app, a domain this project
 * does not own. Mailing "the owner" about every visitor's booking would send
 * mail to a stranger's domain, and each bounce would count against the sender.
 * Customers still get their own emails; a visitor who books the demo sees the
 * confirmation a real customer would.
 */
export function ownerNotificationAddress({
  organizationId,
  contactEmail,
  loginEmail,
}: {
  organizationId: string;
  contactEmail: string | null;
  loginEmail: string | null | undefined;
}): string | null {
  if (DEMO_ACCOUNTS.some((demo) => demo.orgId === organizationId)) return null;
  return contactEmail ?? loginEmail ?? null;
}
