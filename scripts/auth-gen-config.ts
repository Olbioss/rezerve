// Minimal config used only by `@better-auth/cli generate` to emit the drizzle
// auth schema — the real runtime config lives in lib/auth.ts.
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";

export const auth = betterAuth({
  database: drizzleAdapter({} as never, { provider: "pg", schema: {} }),
  emailAndPassword: { enabled: true },
  plugins: [organization()],
});
