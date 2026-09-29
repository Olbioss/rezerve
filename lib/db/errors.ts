/**
 * Postgres error codes this app reacts to by name rather than by message.
 *
 * node-postgres puts the code on the error itself, but a driver or a wrapper
 * may carry it one level down on `cause` instead, so both are checked. A
 * thrown non-object has neither.
 */
export const EXCLUSION_VIOLATION = "23P01";
export const UNIQUE_VIOLATION = "23505";
export const DEADLOCK_DETECTED = "40P01";

export function pgErrorCode(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  return (
    (err as { code?: string }).code ??
    ((err as { cause?: { code?: string } }).cause?.code as string | undefined)
  );
}

/**
 * True when an insert or update lost to a conflicting row under one of the
 * exclusion constraints (bookings_no_overlap, availability_exceptions_no_overlap).
 *
 * Usually that is a plain 23P01. But two transactions inserting conflicting
 * rows at the same moment each place their index entry, each find the other's
 * uncommitted one, and each wait for the other to finish — and Postgres breaks
 * the cycle by aborting one with 40P01 instead. The parallel double-submit
 * test caught it: the loser crashed rather than being told the slot was taken.
 *
 * Only for single statements against those tables, where a deadlock can come
 * from nothing else; the other transaction goes on to commit its row.
 */
export function isExclusionConflict(err: unknown): boolean {
  const code = pgErrorCode(err);
  return code === EXCLUSION_VIOLATION || code === DEADLOCK_DETECTED;
}
