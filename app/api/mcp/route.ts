import { createMcpHandler } from "mcp-handler";
import { registerAssistantTools } from "@/lib/assistant/mcp-server";
import { authenticateAssistant } from "@/lib/assistant/request-auth";

/**
 * The chat assistant's way into Rezerve: a Model Context Protocol endpoint
 * (Streamable HTTP, stateless), used by rezerve-assistant.
 *
 * Every request passes the door first — token, business, customer
 * (lib/assistant/request-auth.ts) — and the identity it settles rides along
 * on `req.auth`, where mcp-handler hands it to each tool. POST only: the
 * stateless protocol has no use for GET, so Next answers it with 405.
 */
const mcp = createMcpHandler(registerAssistantTools, {
  serverInfo: { name: "rezerve", version: "1.0.0" },
});

export async function POST(req: Request): Promise<Response> {
  const auth = await authenticateAssistant(
    req,
    process.env.ASSISTANT_MCP_TOKEN
  );
  if (!auth.ok) return auth.response;
  req.auth = auth.authInfo;
  return mcp(req);
}
