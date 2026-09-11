import { NextResponse } from "next/server";
import {
  chargeSubscription,
  dueSubscriptions,
} from "@/lib/billing/charge-subscription";
import { checkCronAuth } from "@/lib/billing/cron-auth";

/**
 * Daily renewal run.
 *
 * Rezerve owns the billing schedule because Abonelik is unavailable on a
 * marketplace account, so this is the only thing that turns time into money.
 * chargeSubscription is individually idempotent, so a double-fired cron, a
 * retry, or a manual invocation are all safe.
 */
export const maxDuration = 300;

export async function GET(request: Request) {
  // Vercel Cron sends the secret as a bearer token.
  const auth = checkCronAuth(
    request.headers.get("authorization"),
    process.env.CRON_SECRET
  );
  if (auth === "misconfigured") {
    console.error("CRON_SECRET is not set — refusing to run renewals.");
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }
  if (auth !== "ok") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const due = await dueSubscriptions();
  const tally: Record<string, number> = {};

  for (const { organizationId } of due) {
    try {
      const outcome = await chargeSubscription(organizationId);
      tally[outcome] = (tally[outcome] ?? 0) + 1;
    } catch (err) {
      // One bad subscription must not strand the rest of the run.
      console.error(`Renewal failed for ${organizationId}:`, err);
      tally.error = (tally.error ?? 0) + 1;
    }
  }

  return NextResponse.json({ due: due.length, ...tally });
}
