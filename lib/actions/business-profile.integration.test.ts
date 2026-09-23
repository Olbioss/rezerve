/**
 * What a customer sees about a business on its booking page: phone, address
 * and a description. All optional, all public — so the tests are about
 * clearing as much as saving, and about never touching another business.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { ownerMock } = vi.hoisted(() => ({ ownerMock: vi.fn() }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth-guard", () => ({
  requireOwner: ownerMock,
  requireUser: vi.fn(),
}));

const { updatePublicProfile } = await import("./business");
const { db } = await import("@/lib/db");
const { organization } = await import("@/lib/db/schema/auth-schema");
const { businessProfiles } = await import("@/lib/db/schema/business-schema");

const ORG = "org_itest_profile";
const OTHER = "org_itest_profile_other";

const profile = (id: string) =>
  db.query.businessProfiles.findFirst({
    where: eq(businessProfiles.organizationId, id),
  });

beforeEach(async () => {
  for (const id of [ORG, OTHER]) {
    await db.delete(organization).where(eq(organization.id, id));
  }
  await db.insert(organization).values([
    { id: ORG, name: "Salon", slug: "itest-profile", createdAt: new Date() },
    {
      id: OTHER,
      name: "Baska",
      slug: "itest-profile-2",
      createdAt: new Date(),
    },
  ]);
  await db.insert(businessProfiles).values([
    { organizationId: ORG, timezone: "Europe/Istanbul" },
    {
      organizationId: OTHER,
      timezone: "Europe/Istanbul",
      phone: "0212 000 00 00",
    },
  ]);
  ownerMock.mockReset().mockResolvedValue({ organizationId: ORG });
});

afterAll(async () => {
  for (const id of [ORG, OTHER]) {
    await db.delete(organization).where(eq(organization.id, id));
  }
  await db.$client.end();
});

describe("updatePublicProfile", () => {
  it("saves the phone, address and description", async () => {
    const result = await updatePublicProfile({
      phone: " 0532  123 45 67 ",
      address: "  Moda Cd. No:12, Kadıköy  ",
      description: "Cilt bakımı ve kalıcı makyaj.",
    });

    expect(result).toBeUndefined();
    const row = await profile(ORG);
    expect(row?.phone).toBe("0532 123 45 67");
    expect(row?.address).toBe("Moda Cd. No:12, Kadıköy");
    expect(row?.description).toBe("Cilt bakımı ve kalıcı makyaj.");
  });

  it("clears a field left blank", async () => {
    await updatePublicProfile({
      phone: "0532 123 45 67",
      address: "Moda",
      description: "Salon",
    });
    await updatePublicProfile({ phone: "", address: "  ", description: "" });

    const row = await profile(ORG);
    expect(row?.phone).toBeNull();
    expect(row?.address).toBeNull();
    expect(row?.description).toBeNull();
  });

  it("refuses a phone that cannot be a number, saving nothing", async () => {
    const result = await updatePublicProfile({
      phone: "beni ara",
      address: "Moda",
      description: "",
    });

    expect(result?.error).toBe("Geçerli bir telefon numarası girin");
    expect((await profile(ORG))?.address).toBeNull();
  });

  it("refuses a description too long to read on a phone screen", async () => {
    const result = await updatePublicProfile({
      phone: "",
      address: "",
      description: "a".repeat(501),
    });
    expect(result?.error).toMatch(/500/);
  });

  it("touches only the caller's own business", async () => {
    await updatePublicProfile({
      phone: "0532 123 45 67",
      address: "",
      description: "",
    });
    expect((await profile(OTHER))?.phone).toBe("0212 000 00 00");
  });
});
