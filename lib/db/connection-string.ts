/**
 * Neon's console hands out connection strings with sslmode=require.
 * node-postgres treats that as verify-full today but warns about it on every
 * new connection — in production, an "error" in the logs per request — and
 * from pg v9 will read it the libpq way: encrypt, but never check the
 * certificate. Saying verify-full keeps today's behaviour, silences the
 * warning and survives that upgrade, whatever string is pasted into the
 * environment. (It was once fixed in the variable alone, and came back the
 * next time a string was copied from Neon.)
 *
 * Free of imports, so drizzle.config.ts can use it as well as lib/db.
 */
export function withVerifiedTls(connectionString: string): string {
  const url = new URL(connectionString);
  if (url.searchParams.get("sslmode") !== "require") return connectionString;
  url.searchParams.set("sslmode", "verify-full");
  return url.toString();
}
