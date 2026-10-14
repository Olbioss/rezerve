/**
 * /api/mcp end to end, through the real MCP client: the protocol, the door in
 * front of it, and the tools behind it, against the database. Only the
 * network is skipped — the client's fetch calls the route's POST directly.
 */
import { eq } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Map() }));
vi.mock("@/lib/email/booking-notifications", () => ({
  sendBookingConfirmedEmails: vi.fn(),
  sendBookingCancelledEmails: vi.fn(),
  sendBookingRescheduledEmail: vi.fn(),
}));

const TOKEN = "itest-mcp-token";
process.env.ASSISTANT_MCP_TOKEN = TOKEN;

const { POST } = await import("@/app/api/mcp/route");
const { Client, StreamableHTTPClientTransport } = await import(
  "@modelcontextprotocol/client"
);
const { db } = await import("@/lib/db");
const { organization } = await import("@/lib/db/schema/auth-schema");
const { availabilityRules } = await import(
  "@/lib/db/schema/availability-schema"
);
const { bookings } = await import("@/lib/db/schema/booking-schema");
const { businessProfiles } = await import("@/lib/db/schema/business-schema");
const { services } = await import("@/lib/db/schema/service-schema");

const ORG = "org_itest_mcp_route";
const SLUG = "itest-mcp-route";
const REF = `eval:${"a".repeat(26)}`;
const DAY = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
const URL_ = "http://localhost:3000/api/mcp";
let serviceId: string;
const clients: InstanceType<typeof Client>[] = [];

const assistant = {
  authorization: `Bearer ${TOKEN}`,
  "x-rezerve-business": SLUG,
  "x-rezerve-customer": REF,
};

async function connect(headers: Record<string, string> = assistant) {
  const transport = new StreamableHTTPClientTransport(new URL(URL_), {
    fetch: (url, init) => POST(new Request(url, init)),
    requestInit: { headers },
  });
  const client = new Client({ name: "itest", version: "0.0.0" });
  await client.connect(transport);
  clients.push(client);
  return client;
}

beforeAll(async () => {
  await db.delete(organization).where(eq(organization.id, ORG));
  await db
    .insert(organization)
    .values({ id: ORG, name: ORG, slug: SLUG, createdAt: new Date() });
  await db.insert(businessProfiles).values({
    organizationId: ORG,
    timezone: "UTC",
    minLeadTimeMinutes: 0,
    assistantEnabled: true,
  });
  const [service] = await db
    .insert(services)
    .values({
      organizationId: ORG,
      name: "Saç Kesimi",
      durationMinutes: 45,
      priceCents: 80_000,
    })
    .returning({ id: services.id });
  serviceId = service.id;
  await db.insert(availabilityRules).values({
    organizationId: ORG,
    weekday: new Date(`${DAY}T12:00:00Z`).getUTCDay(),
    startMinutes: 9 * 60,
    endMinutes: 17 * 60,
  });
});

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

afterAll(async () => {
  await db.delete(organization).where(eq(organization.id, ORG));
  await db.$client.end();
});

describe("/api/mcp", () => {
  it("lists the eight tools, and marks which of them write", async () => {
    const client = await connect();

    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "cancel_booking",
      "create_booking",
      "find_slots",
      "get_booking",
      "get_business_info",
      "list_my_bookings",
      "list_services",
      "reschedule_booking",
    ]);
    expect(
      tools
        .filter((tool) => tool.annotations?.readOnlyHint === false)
        .map((tool) => tool.name)
        .sort()
    ).toEqual(["cancel_booking", "create_booking", "reschedule_booking"]);
  });

  it("finds a slot and books it for the customer named in the headers", async () => {
    const client = await connect();

    const found = await client.callTool({
      name: "find_slots",
      arguments: {
        service_id: serviceId,
        from_date: DAY,
        to_date: DAY,
        limit: 1,
      },
    });
    const [slot] = (
      found.structuredContent as { slots: { starts_at: string }[] }
    ).slots;
    const booked = await client.callTool({
      name: "create_booking",
      arguments: {
        service_id: serviceId,
        starts_at: slot.starts_at,
        customer_name: "Elif Kaya",
      },
    });

    expect(booked.isError).not.toBe(true);
    const { booking_id } = booked.structuredContent as { booking_id: string };
    const row = await db.query.bookings.findFirst({
      where: eq(bookings.id, booking_id),
    });
    expect(row).toMatchObject({
      source: "assistant",
      customerRef: REF,
      status: "confirmed",
    });
  });

  it("answers a refused booking as a tool error carrying its code", async () => {
    const client = await connect();

    const result = await client.callTool({
      name: "create_booking",
      arguments: {
        service_id: serviceId,
        starts_at: `${DAY}T09:07:00Z`,
        customer_name: "Elif Kaya",
      },
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      code: "slot_unavailable",
    });
  });

  it("turns a request without the token away before any tool runs", async () => {
    const response = await POST(
      new Request(URL_, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-rezerve-business": SLUG,
          "x-rezerve-customer": REF,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      })
    );

    expect(response.status).toBe(401);
  });
});
