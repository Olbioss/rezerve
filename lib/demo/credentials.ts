/**
 * The published demo logins.
 *
 * Deliberately dependency-free (no "server-only", no db) so the landing page,
 * the README generator and the seed script all read the same values — the same
 * reason lib/billing/plans.ts is kept importable from client components.
 *
 * These are public on purpose: a reviewer who cannot sign in sees none of the
 * panel, which is most of the engineering in this repo. Because they are
 * public, anything a signed-in visitor can change has to be restorable — see
 * lib/demo/seed-owner.ts, which resets the password on every run.
 */
export type DemoAccount = {
  orgId: string;
  slug: string;
  name: string;
  ownerName: string;
  email: string;
  password: string;
};

export const DEMO_PRO: DemoAccount = {
  orgId: "org_rezerve_demo",
  slug: "demo",
  name: "Rezerve Demo Salon",
  ownerName: "Demo Salon",
  email: "demo@rezerve.app",
  password: "rezerve-demo",
};

export const DEMO_FREE: DemoAccount = {
  orgId: "org_rezerve_demo_free",
  slug: "demo-ucretsiz",
  name: "Rezerve Demo Berber",
  ownerName: "Demo Berber",
  email: "ucretsiz@rezerve.app",
  password: "rezerve-demo",
};

export const DEMO_ACCOUNTS = [DEMO_PRO, DEMO_FREE] as const;
