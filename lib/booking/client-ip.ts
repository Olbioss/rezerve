import "server-only";
import { headers } from "next/headers";

/**
 * iyzico rejects a basket with no buyer IP, and local development has none —
 * so the payment path has always needed a stand-in. It is a documented
 * sandbox address, not a real client.
 */
export const FALLBACK_IP = "85.34.78.112";

/** The client's address, or null when the proxy sent no forwarded-for. */
export async function clientIp(): Promise<string | null> {
  const requestHeaders = await headers();
  return requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}
