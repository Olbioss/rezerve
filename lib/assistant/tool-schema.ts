import { z } from "zod";
import { TOOL_DEFINITIONS } from "./tool-definitions";

/**
 * The assistant's tools as JSON Schema — the contract rezerve-asistan keeps a
 * copy of and tests itself against, so the two repositories cannot drift
 * apart unnoticed. Pure: no database, no request.
 */
export function toolSchemaDocument() {
  return {
    server: "rezerve" as const,
    tools: Object.entries(TOOL_DEFINITIONS).map(([name, definition]) => ({
      name,
      title: definition.title,
      description: definition.description,
      annotations: definition.annotations,
      inputSchema: z.toJSONSchema(definition.input),
      outputSchema: z.toJSONSchema(definition.output),
    })),
  };
}
