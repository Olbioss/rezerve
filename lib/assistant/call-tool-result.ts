import type { CallToolResult } from "@modelcontextprotocol/server";
import { type ToolResult, toolError } from "./tool-result";

/**
 * A tool's result as MCP carries it: the structured object for the client to
 * read, the same as JSON text for clients that only show text, and refusals
 * as tool errors carrying their stable code — the model reads those and tries
 * something else, which is what a refusal is for. The SDK checks successes
 * against the output schema and leaves errors alone.
 */
export function asCallToolResult<T extends Record<string, unknown>>(
  result: ToolResult<T>
): CallToolResult {
  const payload = result.ok ? result.data : result.error;
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: payload,
    ...(result.ok ? {} : { isError: true }),
  };
}

/**
 * Run one tool, and never let what it throws reach the model.
 *
 * An unexpected failure — the database down, a bug — would otherwise arrive
 * as its raw message, and for a failed query that is the SQL and its
 * parameters, the customer's details among them; the model could repeat it
 * to the customer. It is logged here instead, and the tool answers with a
 * stable code and a Turkish apology.
 */
export async function runTool<T extends Record<string, unknown>>(
  name: string,
  work: () => Promise<ToolResult<T>>
): Promise<CallToolResult> {
  try {
    return asCallToolResult(await work());
  } catch (err) {
    console.error(`Assistant tool ${name} failed:`, err);
    return asCallToolResult(
      toolError(
        "internal",
        "Şu an bu işlemi yapamıyorum — lütfen biraz sonra tekrar deneyin."
      )
    );
  }
}
