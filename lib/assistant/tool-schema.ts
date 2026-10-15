import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";
import { TOOL_DEFINITIONS, toolConfig } from "./tool-definitions";

/**
 * The assistant's tools exactly as /api/mcp lists them — the contract
 * rezerve-assistant keeps a copy of and tests itself against, so the two
 * repositories cannot drift apart unnoticed.
 *
 * The list comes from a real MCP server and client talking in memory, so the
 * JSON Schema is the SDK's own conversion rather than a second guess at it.
 * The handlers never run: listing tools reaches no database and no request.
 */
export async function toolSchemaDocument() {
  const server = new McpServer({ name: "rezerve", version: "1.0.0" });
  for (const [name, definition] of Object.entries(TOOL_DEFINITIONS)) {
    server.registerTool(name, toolConfig(definition), () => {
      throw new Error("The schema export never calls a tool");
    });
  }
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "rezerve-mcp-schema", version: "1.0.0" });
  await client.connect(clientSide);
  try {
    const { tools } = await client.listTools();
    return { server: "rezerve" as const, tools };
  } finally {
    await client.close();
    await server.close();
  }
}
