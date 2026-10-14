/**
 * What a tool function returns: its data, or a refusal with a stable code the
 * assistant can branch on and a Turkish message it can pass along.
 */
export type ToolError = { code: string; message: string };

export type ToolResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ToolError };

export function toolError(
  code: string,
  message: string
): { ok: false; error: ToolError } {
  return { ok: false, error: { code, message } };
}
