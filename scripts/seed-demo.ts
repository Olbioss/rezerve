/**
 * Create the public demo businesses shown from the landing page — or put them
 * back exactly as published, which is the same thing.
 *
 * Two of them, on purpose:
 *   /r/demo           — Pro, with an approved payout account: kapora is collected
 *   /r/demo-ucretsiz  — free plan, same service config: kapora is stored but NOT
 *                       collected, which is the only way to *see* the downgrade
 *                       rule rather than read about it
 *
 * Each gets an owner that can actually sign in, with published credentials
 * (lib/demo/credentials.ts). Everything else — the reset itself, and why it
 * is a reset — is in lib/demo/reset.ts, which the daily cron also runs.
 *
 * Destructive for the demos, and only for them: their bookings, services,
 * hours and special days are replaced wholesale.
 *
 *   bun run seed:demo
 */
import "dotenv/config";
import { db } from "@/lib/db";
import { DEMO_FREE, DEMO_PRO } from "@/lib/demo/credentials";
import { resetDemo } from "@/lib/demo/reset";

async function main() {
  const summary = await resetDemo();

  for (const [slug, result] of Object.entries(summary)) {
    console.log(
      `✓ ${slug}: reset — ${result.bookings} bookings${result.slugRestored ? "" : ", address taken by another business"}`
    );
  }
  if (summary[DEMO_PRO.slug]?.collectsKapora === false) {
    console.warn(
      "\n! The Pro demo has no submerchant — it cannot collect kapora."
    );
    console.warn(
      "  Run `bun run demo:submerchant`, put DEMO_SUBMERCHANT_KEY in .env, then re-run this.\n"
    );
  }

  console.log(
    `\nPro demo:      /r/${DEMO_PRO.slug}        (kapora tahsil edilir)`
  );
  console.log(
    `Ücretsiz demo: /r/${DEMO_FREE.slug} (kapora saklı ama tahsil edilmez)`
  );
  console.log("\nPanel logins:");
  for (const demo of [DEMO_PRO, DEMO_FREE]) {
    console.log(`  ${demo.email}  /  ${demo.password}`);
  }
  await db.$client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
