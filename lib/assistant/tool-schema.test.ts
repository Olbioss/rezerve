/**
 * The tool contract as the assistant's repository receives it: exactly the
 * list /api/mcp serves. The one rule that matters most is structural: no tool
 * lets the model name a business or a customer — those come from headers only.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { toolSchemaDocument } from "./tool-schema";

type JsonSchema = {
  properties?: Record<string, { format?: string }>;
  required?: string[];
  additionalProperties?: boolean;
};
let document: Awaited<ReturnType<typeof toolSchemaDocument>>;
const input = (name: string) =>
  document.tools.find((tool) => tool.name === name)?.inputSchema as JsonSchema;

beforeAll(async () => {
  document = await toolSchemaDocument();
});

describe("toolSchemaDocument", () => {
  it("publishes the eight tools", () => {
    expect(document.tools.map((tool) => tool.name).sort()).toEqual([
      "cancel_booking",
      "create_booking",
      "find_slots",
      "get_booking",
      "get_business_info",
      "list_my_bookings",
      "list_services",
      "reschedule_booking",
    ]);
  });

  it("never takes a business or a customer as an argument", () => {
    for (const tool of document.tools) {
      for (const property of Object.keys(
        (tool.inputSchema as JsonSchema).properties ?? {}
      )) {
        expect(property).not.toMatch(
          /slug|business|organization|customer_ref|customer_id/
        );
      }
    }
  });

  it("requires what a booking cannot be made without, and nothing more", () => {
    expect(input("create_booking").required?.sort()).toEqual([
      "customer_name",
      "service_id",
      "starts_at",
    ]);
  });

  it("describes instants as date-times", () => {
    expect(input("create_booking").properties?.starts_at.format).toBe(
      "date-time"
    );
  });

  it("is the list the server serves, which reads inputs leniently", () => {
    // zod's output mode would add additionalProperties: false; the SDK
    // converts tool inputs in input mode, and the copy must match it.
    expect(input("find_slots").additionalProperties).toBeUndefined();
    expect(Object.keys(input("find_slots").properties ?? {})).toContain(
      "rescheduling_booking_id"
    );
  });
});
