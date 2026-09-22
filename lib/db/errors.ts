/**
 * Postgres error codes this app reacts to by name rather than by message.
 *
 * node-postgres puts the code on the error itself, but a driver or a wrapper
 * may carry it one level down on `cause` instead, so both are checked. A
 * thrown non-object has neither.
 */
export const EXCLUSION_VIOLATION = "23P01";
export const UNIQUE_VIOLATION = "23505";

export function pgErrorCode(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  return (
    (err as { code?: string }).code ??
    ((err as { cause?: { code?: string } }).cause?.code as string | undefined)
  );
}
