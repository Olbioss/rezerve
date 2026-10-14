/**
 * The door in front of /api/mcp. The assistant proves itself with a shared
 * token, and names the business and the customer in headers — the only
 * place they can come from, since no tool takes them as arguments.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { organization } from "@/lib/db/schema/auth-schema";
import { businessProfiles } from "@/lib/db/schema/business-schema";
import { identityFrom } from "./identity";
import { authenticateAssistant } from "./request-auth";

const ON = { id: "org_itest_mcp_auth_on", slug: "itest-mcp-auth-on" };
const OFF = { id: "org_itest_mcp_auth_off", slug: "itest-mcp-auth-off" };
const SECRET = "itest-assistant-token";
const ALI = `telegram:${"a".repeat(26)}`;

beforeAll(async () => {
  for (const org of [ON, OFF]) {
    await db.delete(organization).where(eq(organization.id, org.id));
    await db.insert(organization).values({
      id: org.id,
      name: org.id,
      slug: org.slug,
      createdAt: new Date(),
    });
    await db.insert(businessProfiles).values({
      organizationId: org.id,
      timezone: "Europe/Istanbul",
      assistantEnabled: org === ON,
    });
  }
});

afterAll(async () => {
  for (const org of [ON, OFF]) {
    await db.delete(organization).where(eq(organization.id, org.id));
  }
  await db.$client.end();
});

const valid = {
  authorization: `Bearer ${SECRET}`,
  "x-rezerve-business": ON.slug,
  "x-rezerve-customer": ALI,
};

const request = (headers: Record<string, string>) =>
  new Request("http://localhost:3000/api/mcp", { method: "POST", headers });

async function statusOf(
  headers: Record<string, string>,
  secret: string | undefined = SECRET
) {
  const auth = await authenticateAssistant(request(headers), secret);
  return auth.ok ? 200 : auth.response.status;
}

describe("authenticateAssistant", () => {
  it("refuses everyone while the token is not configured", async () => {
    // Called directly: statusOf's default would swallow an explicit undefined.
    for (const secret of [undefined, ""]) {
      const auth = await authenticateAssistant(request(valid), secret);
      expect(auth.ok ? 200 : auth.response.status).toBe(503);
    }
  });

  it("refuses a missing or wrong token", async () => {
    expect(
      await statusOf({
        "x-rezerve-business": ON.slug,
        "x-rezerve-customer": ALI,
      })
    ).toBe(401);
    expect(
      await statusOf({ ...valid, authorization: "Bearer not-the-token" })
    ).toBe(401);
  });

  it("takes the customer ref exactly as the assistant writes it, or not at all", async () => {
    for (const ref of [
      "",
      `telegram:${"A".repeat(26)}`,
      `telegram:${"a".repeat(25)}`,
      `sms:${"a".repeat(26)}`,
      `telegram:${"a".repeat(25)}1`,
    ]) {
      expect(await statusOf({ ...valid, "x-rezerve-customer": ref })).toBe(400);
    }
  });

  it("answers an unknown business and a switched-off one alike", async () => {
    expect(
      await statusOf({ ...valid, "x-rezerve-business": "itest-no-such-shop" })
    ).toBe(403);
    expect(await statusOf({ ...valid, "x-rezerve-business": OFF.slug })).toBe(
      403
    );
  });

  it("hands the tools the business and the customer", async () => {
    const auth = await authenticateAssistant(request(valid), SECRET);
    if (!auth.ok) throw new Error(`refused: ${auth.response.status}`);

    const identity = identityFrom(auth.authInfo);
    expect(identity.business.slug).toBe(ON.slug);
    expect(identity.business.organizationId).toBe(ON.id);
    expect(identity.customerRef).toBe(ALI);
  });

  it("never lets a tool run as nobody", () => {
    expect(() => identityFrom(undefined)).toThrow(
      /without an authenticated identity/
    );
  });
});
