import { NextResponse } from "next/server";
import {
  chargeSubscription,
  dueSubscriptions,
} from "@/lib/billing/charge-subscription";
import { checkCronAuth } from "@/lib/billing/cron-auth";
import { expireAllHolds } from "@/lib/booking/expire-holds";

/**
 * The daily maintenance run.
 *
 * Renewals are the reason it exists: Rezerve owns its own billing schedule,
 * because Abonelik is unavailable on a marketplace account, so this is the
 * only thing that turns time into money. chargeSubscription is individually
 * idempotent, so a double-fired cron, a retry or a manual invocation are all
 * safe.
 *
 * It also sweeps lapsed holds, which would otherwise only be released when
 * somebody next tries to book that organization. The path is still named
 * after renewals because vercel.json and the README both point at it, and one
 * scheduled job is deliberate rather than incidental — several would each
 * need their own schedule and secret for no gain.
 *
 * Each step is guarded on its own: a sweep that fails must not strand the
 * renewals beside it, and neither must the reverse.
 */
export const maxDuration = 300;

async function runRenewals() {
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

  return { due: due.length, ...tally };
}

export async function GET(request: Request) {
  // Vercel Cron sends the secret as a bearer token.
  const auth = checkCronAuth(
    request.headers.get("authorization"),
    process.env.CRON_SECRET
  );
  if (auth === "misconfigured") {
    console.error("CRON_SECRET is not set — refusing to run the daily job.");
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }
  if (auth !== "ok") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let renewals: Record<string, number> | { error: true };
  try {
    renewals = await runRenewals();
  } catch (err) {
    console.error("Renewal run failed:", err);
    renewals = { error: true };
  }

  let holds: { expired: number } | { error: true };
  try {
    holds = { expired: await expireAllHolds() };
  } catch (err) {
    console.error("Hold sweep failed:", err);
    holds = { error: true };
  }

  return NextResponse.json({ renewals, holds });
}
