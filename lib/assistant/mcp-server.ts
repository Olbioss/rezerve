import "server-only";
import type { CallToolResult, McpServer } from "@modelcontextprotocol/server";
import { identityFrom } from "./identity";
import {
  findSlots,
  getBooking,
  getBusinessInfo,
  listMyBookings,
  listServices,
} from "./read-tools";
import { TOOL_DEFINITIONS } from "./tool-definitions";
import type { ToolResult } from "./tool-result";
import {
  cancelBookingTool,
  createBookingTool,
  rescheduleBookingTool,
} from "./write-tools";

type Definition = (typeof TOOL_DEFINITIONS)[keyof typeof TOOL_DEFINITIONS];

/** A definition as registerTool takes it — specific types kept per tool. */
function config<D extends Definition>(definition: D) {
  return {
    title: definition.title,
    description: definition.description,
    inputSchema: definition.input as D["input"],
    outputSchema: definition.output as D["output"],
    annotations: definition.annotations,
  };
}

/**
 * A tool's result as MCP carries it: the structured object for the client to
 * read, the same as JSON text for clients that only show text, and refusals
 * as tool errors carrying their stable code — the model reads those and tries
 * something else, which is what a refusal is for. The SDK checks successes
 * against the output schema and leaves errors alone.
 */
function asCallToolResult<T extends Record<string, unknown>>(
  result: ToolResult<T>
): CallToolResult {
  const payload = result.ok ? result.data : result.error;
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: payload,
    ...(result.ok ? {} : { isError: true }),
  };
}

export function registerAssistantTools(server: McpServer): void {
  const tools = TOOL_DEFINITIONS;

  server.registerTool(
    "get_business_info",
    config(tools.get_business_info),
    async (_args, ctx) =>
      asCallToolResult(await getBusinessInfo(identityFrom(ctx.http?.authInfo)))
  );
  server.registerTool(
    "list_services",
    config(tools.list_services),
    async (_args, ctx) =>
      asCallToolResult(await listServices(identityFrom(ctx.http?.authInfo)))
  );
  server.registerTool(
    "find_slots",
    config(tools.find_slots),
    async (args, ctx) =>
      asCallToolResult(await findSlots(identityFrom(ctx.http?.authInfo), args))
  );
  server.registerTool(
    "list_my_bookings",
    config(tools.list_my_bookings),
    async (_args, ctx) =>
      asCallToolResult(await listMyBookings(identityFrom(ctx.http?.authInfo)))
  );
  server.registerTool(
    "get_booking",
    config(tools.get_booking),
    async (args, ctx) =>
      asCallToolResult(await getBooking(identityFrom(ctx.http?.authInfo), args))
  );
  server.registerTool(
    "create_booking",
    config(tools.create_booking),
    async (args, ctx) =>
      asCallToolResult(
        await createBookingTool(identityFrom(ctx.http?.authInfo), args)
      )
  );
  server.registerTool(
    "reschedule_booking",
    config(tools.reschedule_booking),
    async (args, ctx) =>
      asCallToolResult(
        await rescheduleBookingTool(identityFrom(ctx.http?.authInfo), args)
      )
  );
  server.registerTool(
    "cancel_booking",
    config(tools.cancel_booking),
    async (args, ctx) =>
      asCallToolResult(
        await cancelBookingTool(identityFrom(ctx.http?.authInfo), args)
      )
  );
}
