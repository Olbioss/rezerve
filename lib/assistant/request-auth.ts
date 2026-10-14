import "server-only";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { getBusinessBySlug } from "@/lib/booking/get-available-slots";
import { checkBearer } from "@/lib/security/bearer";
import {
  type AssistantIdentity,
  BUSINESS_HEADER,
  CUSTOMER_HEADER,
  isCustomerRef,
} from "./identity";

export const ASSISTANT_CLIENT_ID = "rezerve-asistan";

export type AssistantAuth =
  | { ok: true; authInfo: AuthInfo }
  | { ok: false; response: Response };

function deny(status: number, error: string): AssistantAuth {
  return { ok: false, response: Response.json({ error }, { status }) };
}

/**
 * The door in front of /api/mcp, checked on every request.
 *
 * One service holds the token — rezerve-asistan — so this is a shared secret
 * rather than OAuth: there is no third party to delegate to. What the token
 * does not settle, the headers do: which business, and which of its chat
 * customers. Both are checked here, before any tool can run.
 */
export async function authenticateAssistant(
  req: Request,
  secret: string | undefined
): Promise<AssistantAuth> {
  const bearer = checkBearer(req.headers.get("authorization"), secret);
  if (bearer === "misconfigured") {
    console.error("ASSISTANT_MCP_TOKEN is not set; /api/mcp refuses everyone");
    return deny(503, "misconfigured");
  }
  if (bearer === "unauthorized") return deny(401, "unauthorized");

  const customerRef = req.headers.get(CUSTOMER_HEADER) ?? "";
  if (!isCustomerRef(customerRef)) return deny(400, "invalid_customer");

  const slug = req.headers.get(BUSINESS_HEADER) ?? "";
  const business = slug ? await getBusinessBySlug(slug) : null;
  // One answer for "no such business" and "not switched on": the token holder
  // learns nothing about which businesses exist.
  if (!business?.profile.assistantEnabled) return deny(403, "forbidden");

  const identity: AssistantIdentity = { business, customerRef };
  return {
    ok: true,
    authInfo: {
      // The secret itself never travels further than this check.
      token: "service",
      clientId: ASSISTANT_CLIENT_ID,
      scopes: ["assistant"],
      extra: { identity },
    },
  };
}
