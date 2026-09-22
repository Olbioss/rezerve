import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins";
import { APP_URL, originOr } from "@/lib/app-url";
import { db } from "@/lib/db";
import {
  account,
  invitation,
  member,
  organization as organizationTable,
  rateLimit,
  session,
  user,
  verification,
} from "@/lib/db/schema/auth-schema";

export const auth = betterAuth({
  appName: "Rezerve",
  // An empty BETTER_AUTH_URL is "not configured" and a bare hostname is not a
  // base URL — either one made Better Auth build an invalid URL and fail the
  // build.
  baseURL: originOr(process.env.BETTER_AUTH_URL, APP_URL),
  basePath: "/api/auth",
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [
    originOr(process.env.BETTER_AUTH_URL, APP_URL),
    APP_URL,
  ].filter((origin): origin is string => Boolean(origin)),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    autoSignIn: true,
  },
  session: {
    /**
     * Sign a short-lived copy of the session into a cookie so getSession()
     * stops hitting the database on most requests — it sits on the critical
     * path of every authenticated page and action.
     *
     * The cost is revocation latency: a signed-out or deleted session stays
     * readable for up to maxAge. Five minutes is the usual trade; anything
     * genuinely sensitive is re-checked against the database anyway, because
     * requireOwner() still reads membership and the business profile.
     */
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
    defaultCookieAttributes: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    },
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    // "memory" is per-instance, and Fluid Compute reuses several — so three
    // sign-in attempts per ten seconds was really three per instance, and
    // concurrency silently multiplied the limit. The database is the only
    // place a shared counter can live here.
    storage: "database",
    customRules: {
      "/sign-in/email": { window: 10, max: 3 },
      "/sign-up/email": { window: 10, max: 3 },
    },
  },
  plugins: [
    organization({
      // One business per owner account in v1.
      organizationLimit: 1,
      organizationCreation: { disabled: false },
    }),
    nextCookies(), // must be last
  ],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user,
      account,
      session,
      verification,
      organization: organizationTable,
      member,
      invitation,
      rateLimit,
    },
  }),
});

export type Session = typeof auth.$Infer.Session;
