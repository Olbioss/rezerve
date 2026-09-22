import "server-only";
import { and, count, eq, gte, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookingAttempts } from "@/lib/db/schema/booking-schema";

/**
 * Throttle the public booking form.
 *
 * createBooking is unauthenticated and every booking holds its slot
 * permanently through the exclusion constraint, so one bored visitor can fill
 * a calendar and leave every reviewer after them looking at a wrecked demo.
 * Better Auth's rate limiting does not reach here — it guards /api/auth/*,
 * and this is a server action.
 *
 * The attempt is recorded before it is counted, so two concurrent requests see
 * each other rather than both slipping through. A rejected attempt still
 * counts: it was an attempt, and not counting it would let a caller stay just
 * under the limit forever by ignoring the rejections.
 *
 * This is a demo-integrity measure, not a security control. It is keyed on an
 * address the client can influence and an email it chooses, so it raises the
 * cost of casual spam and nothing more. What actually protects correctness is
 * the exclusion constraint, which is in the database and cannot be talked out
 * of.
 */
const WINDOW_MINUTES = 60;
const MAX_PER_IP = 6;
const MAX_PER_EMAIL = 3;

export const THROTTLED_MESSAGE =
  "Çok fazla randevu denemesi yaptınız — lütfen bir süre sonra tekrar deneyin.";

export async function checkBookingThrottle(input: {
  organizationId: string;
  ip: string | null;
  email: string;
}): Promise<string | null> {
  const { organizationId, ip, email } = input;
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000);

  // Nothing older than the window can affect a decision, so the table prunes
  // itself on the way past rather than needing a job of its own.
  await db.delete(bookingAttempts).where(lt(bookingAttempts.createdAt, since));

  await db.insert(bookingAttempts).values({ organizationId, ip, email });

  const recent = and(
    eq(bookingAttempts.organizationId, organizationId),
    gte(bookingAttempts.createdAt, since)
  );

  const [byEmail] = await db
    .select({ n: count() })
    .from(bookingAttempts)
    .where(and(recent, eq(bookingAttempts.email, email)));
  if ((byEmail?.n ?? 0) > MAX_PER_EMAIL) return THROTTLED_MESSAGE;

  // A missing forwarded-for is not a shared identity — it would put every
  // such caller in one bucket — so it is simply not counted.
  if (ip) {
    const [byIp] = await db
      .select({ n: count() })
      .from(bookingAttempts)
      .where(and(recent, eq(bookingAttempts.ip, ip)));
    if ((byIp?.n ?? 0) > MAX_PER_IP) return THROTTLED_MESSAGE;
  }

  return null;
}
