/**
 * Give the demo organizations an owner that can actually sign in.
 *
 * The seed used to create organizations, services, availability, a Pro
 * subscription and a payout account — but never a `user`, `account` or
 * `member` row. requireOwner() resolves a business purely through `member`
 * (lib/auth-guard.ts), so no credential anywhere reached the demo data and
 * eight of the panel routes rendered for nobody.
 *
 * The password has to be hashed exactly the way the login path expects, so it
 * comes from Better Auth rather than from us. But the runtime instance in
 * lib/auth.ts loads nextCookies(), which reaches for next/headers and has no
 * request to read outside the app. So this builds a standalone instance the
 * same way scripts/auth-gen-config.ts does — same adapter, same password
 * config, no cookie plugin and no auto sign-in, since nobody is here to
 * receive a session.
 *
 * The `member` row is inserted directly: it carries no credential, only the
 * link, so there is nothing for Better Auth to get right about it.
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization as organizationPlugin } from "better-auth/plugins";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  account,
  invitation,
  member,
  organization,
  session,
  user,
  verification,
} from "@/lib/db/schema/auth-schema";
import type { DemoAccount } from "./credentials";

/** Better Auth's provider id for an email/password account. */
const CREDENTIAL_PROVIDER = "credential";

const demoAuth = betterAuth({
  appName: "Rezerve",
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    autoSignIn: false,
  },
  plugins: [organizationPlugin({ organizationLimit: 1 })],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user,
      account,
      session,
      verification,
      organization,
      member,
      invitation,
    },
  }),
});

/**
 * Create the owner if missing, and reset the password if it already exists.
 *
 * The reset is the point, not a convenience: the credentials are published, so
 * the first visitor who changes the password would otherwise lock every later
 * reviewer — and the demo owner — out of the panel permanently.
 */
export async function ensureDemoOwner(demo: DemoAccount): Promise<string> {
  const existing = await db.query.user.findFirst({
    where: eq(user.email, demo.email),
  });

  let userId: string;
  if (existing) {
    userId = existing.id;
    const ctx = await demoAuth.$context;
    const hash = await ctx.password.hash(demo.password);
    await db
      .update(account)
      .set({ password: hash })
      .where(
        and(
          eq(account.userId, userId),
          eq(account.providerId, CREDENTIAL_PROVIDER)
        )
      );
    console.log(`• ${demo.slug}: owner ${demo.email} exists, password reset`);
  } else {
    const created = await demoAuth.api.signUpEmail({
      body: {
        name: demo.ownerName,
        email: demo.email,
        password: demo.password,
      },
    });
    userId = created.user.id;
    console.log(`✓ ${demo.slug}: owner ${demo.email} created`);
  }

  // Deterministic id so a re-run repoints the link rather than duplicating it.
  await db
    .insert(member)
    .values({
      id: `mem_${demo.orgId}`,
      organizationId: demo.orgId,
      userId,
      role: "owner",
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: member.id,
      set: { userId, organizationId: demo.orgId, role: "owner" },
    });

  return userId;
}
