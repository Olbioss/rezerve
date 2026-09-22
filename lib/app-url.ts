import "server-only";

/**
 * The app's own origin, as one answer instead of three.
 *
 * This has now broken a deployment twice, both times on the *shape* of a
 * value rather than a missing one, so it normalises rather than trusts:
 *
 *   ""                        an empty dashboard field. `??` does not catch
 *                             it, so it reached `new URL("")` and failed the
 *                             build while collecting page data.
 *   "rezerve.vercel.app"      a hostname copied from a dashboard, which shows
 *                             domains without a scheme. `new URL()` rejects
 *                             it for being relative — the identical error.
 *
 * A bare hostname has exactly one sensible reading, so it gets https://. A
 * value that still will not parse is treated as absent and the next candidate
 * wins, because failing at module scope takes every page down with it and
 * names neither the variable nor the file.
 *
 * Reading `.origin` also drops any trailing slash or path, so every caller
 * gets the same string to build on.
 */
function toOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const absolute = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    return new URL(absolute).origin;
  } catch {
    return undefined;
  }
}

/**
 * Normalise a configured origin, falling back to the app's own.
 *
 * Used for BETTER_AUTH_URL, which has to agree with APP_URL or Better Auth
 * builds callbacks and cookies for the wrong host.
 */
export function originOr(value: string | undefined, fallback: string): string {
  return toOrigin(value) ?? fallback;
}

/**
 * APP_URL is the name to set. Every reader of this value is server-side —
 * the root layout's metadata, the auth config, the iyzico callback and
 * createBooking — so the NEXT_PUBLIC_ prefix bought nothing and cost
 * something: a public prefix forces the variable to be readable in the
 * browser, which a host may refuse to combine with a private variable type.
 *
 * NEXT_PUBLIC_APP_URL is still read, second, so an environment set up under
 * the old name keeps working while it is being renamed. It can go once
 * nothing sets it.
 *
 * Both are written as literal `process.env.X` expressions on purpose: the
 * bundler substitutes that exact form, and a variable key would not be
 * substituted at all.
 *
 * On Vercel the last resort before localhost is the deployment's own origin,
 * which is right for previews and for a production deploy nobody has given an
 * explicit URL. Prefer setting APP_URL to the stable address: VERCEL_URL is
 * per-deployment, so links built from it outlive nothing.
 *
 * `server-only` is deliberate. Without the public prefix this value is not
 * substituted into client bundles, so importing it from a client component
 * would silently yield the fallback rather than the configured origin. This
 * turns that into a build error.
 */
export const APP_URL: string =
  toOrigin(process.env.APP_URL) ??
  toOrigin(process.env.NEXT_PUBLIC_APP_URL) ??
  toOrigin(process.env.VERCEL_URL) ??
  "http://localhost:3000";
