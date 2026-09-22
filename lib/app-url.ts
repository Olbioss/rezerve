/**
 * The app's own origin, as one answer instead of three.
 *
 * An unset variable and one set to an empty string mean the same thing here,
 * and a dashboard makes the second easy to produce — a key added with the
 * value left blank. `??` only catches the first, so an empty
 * NEXT_PUBLIC_APP_URL went straight into `new URL("")` and failed the build
 * during "Collecting page data", with an error that named neither the
 * variable nor the file that read it.
 *
 * So `||` here is deliberate rather than careless: every falsy value this can
 * hold — "" or undefined — means "not configured", and the next candidate
 * should win.
 *
 * On Vercel the fallback is the deployment's own origin rather than
 * localhost, which is correct for previews and for a production deploy that
 * has not been given an explicit URL. Set NEXT_PUBLIC_APP_URL to the custom
 * domain when there is one: VERCEL_URL is the per-deployment hostname, so
 * links built from it are stable only for as long as that deployment is.
 *
 * Written as a literal `process.env.NEXT_PUBLIC_APP_URL` on purpose — the
 * bundler substitutes that exact expression, and reading it through a
 * variable key would leave it undefined in client bundles.
 */
export const APP_URL: string =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
  "http://localhost:3000";
