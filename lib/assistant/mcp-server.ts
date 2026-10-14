import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { runTool } from "./call-tool-result";
import { identityFrom } from "./identity";
import {
  findSlots,
  getBooking,
  getBusinessInfo,
  listMyBookings,
  listServices,
} from "./read-tools";
import { TOOL_DEFINITIONS } from "./tool-definitions";
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

export function registerAssistantTools(server: McpServer): void {
  const tools = TOOL_DEFINITIONS;

  server.registerTool(
    "get_business_info",
    config(tools.get_business_info),
    (_args, ctx) =>
      runTool("get_business_info", () =>
        getBusinessInfo(identityFrom(ctx.http?.authInfo))
      )
  );
  server.registerTool(
    "list_services",
    config(tools.list_services),
    (_args, ctx) =>
      runTool("list_services", () =>
        listServices(identityFrom(ctx.http?.authInfo))
      )
  );
  server.registerTool("find_slots", config(tools.find_slots), (args, ctx) =>
    runTool("find_slots", () =>
      findSlots(identityFrom(ctx.http?.authInfo), args)
    )
  );
  server.registerTool(
    "list_my_bookings",
    config(tools.list_my_bookings),
    (_args, ctx) =>
      runTool("list_my_bookings", () =>
        listMyBookings(identityFrom(ctx.http?.authInfo))
      )
  );
  server.registerTool("get_booking", config(tools.get_booking), (args, ctx) =>
    runTool("get_booking", () =>
      getBooking(identityFrom(ctx.http?.authInfo), args)
    )
  );
  server.registerTool(
    "create_booking",
    config(tools.create_booking),
    (args, ctx) =>
      runTool("create_booking", () =>
        createBookingTool(identityFrom(ctx.http?.authInfo), args)
      )
  );
  server.registerTool(
    "reschedule_booking",
    config(tools.reschedule_booking),
    (args, ctx) =>
      runTool("reschedule_booking", () =>
        rescheduleBookingTool(identityFrom(ctx.http?.authInfo), args)
      )
  );
  server.registerTool(
    "cancel_booking",
    config(tools.cancel_booking),
    (args, ctx) =>
      runTool("cancel_booking", () =>
        cancelBookingTool(identityFrom(ctx.http?.authInfo), args)
      )
  );
}
