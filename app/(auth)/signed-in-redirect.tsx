import { redirectIfSignedIn } from "@/lib/auth-guard";

/**
 * Sends someone already signed in to the panel. It renders nothing and sits
 * in its own Suspense boundary, so the form beside it belongs to the static
 * shell; the check runs at request time and, the page having started
 * streaming by then, redirects from the browser.
 */
export async function SignedInRedirect() {
  await redirectIfSignedIn();
  return null;
}
