import "server-only";

/**
 * The app's own origin, as one answer instead of three.
 *
 * This broke a deployment twice, both times on the *shape* of a value rather
 * than its absence, so it normalises rather than trusts:
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
 * mints callbacks and cookies for the wrong host.
 */
export function originOr(value: string | undefined, fallback: string): string {
  return toOrigin(value) ?? fallback;
}

/**
 * On Vercel the fallback is the deployment's own origin rather than
 * localhost, which is right for previews and for a production deploy nobody
 * has given an explicit URL. Set NEXT_PUBLIC_APP_URL to the stable address:
 * VERCEL_URL is per-deployment, so links built from it outlive nothing.
 *
 * Written as a literal `process.env.NEXT_PUBLIC_APP_URL` on purpose — the
 * bundler substitutes that exact expression, and reading it through a
 * variable key would not be substituted at all.
 *
 * `server-only` because the candidates disagree across the boundary:
 * VERCEL_URL has no public prefix, so a client import would skip it and fall
 * to localhost while the server resolved the real origin. Nothing on the
 * client needs this value; the guard keeps it that way.
 */
export const APP_URL: string =
  toOrigin(process.env.NEXT_PUBLIC_APP_URL) ??
  toOrigin(process.env.VERCEL_URL) ??
  "http://localhost:3000";
