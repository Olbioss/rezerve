/**
 * Create the rezerve-assistant eval business, or put it back exactly as seeded:
 * /r/eval, with the Pro demo's services and hours and no bookings.
 *
 * Local databases only — it refuses a DATABASE_URL that is not on this
 * machine, the same rule the end-to-end suite keeps (playwright.config.ts).
 *
 *   DATABASE_URL=postgresql://<user>@localhost:5432/<db> bun run seed:eval
 */
import "dotenv/config";
import { db } from "@/lib/db";
import { DEMO_EVAL } from "@/lib/demo/credentials";
import { resetEvalBusiness } from "@/lib/demo/reset";

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

async function main() {
  const url = process.env.DATABASE_URL;
  const host = url ? new URL(url).hostname : "";
  if (!LOCAL_HOSTS.includes(host)) {
    console.error(
      `Refusing to seed the eval business on "${host || "no database"}": local databases only.`
    );
    process.exit(1);
  }

  const summary = await resetEvalBusiness();
  console.log(`✓ ${DEMO_EVAL.slug}: reset — no bookings, assistant on`);
  if (summary.collectsKapora === false) {
    console.warn(
      "! No submerchant: kapora scenarios will fail. Put DEMO_SUBMERCHANT_KEY in .env and re-run."
    );
  }
  await db.$client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
