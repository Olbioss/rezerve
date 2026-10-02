/**
 * Renaming a business and moving its public address.
 *
 * The interesting part is not the update — it is what happens when the
 * address is already taken. slugSchema can reject a reserved word, but it
 * cannot know what other businesses hold, so that case only surfaces as a
 * unique violation from Postgres and has to come back as something an owner
 * can act on.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { ownerMock } = vi.hoisted(() => ({ ownerMock: vi.fn() }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth-guard", () => ({
  requireOwner: ownerMock,
  requireUser: vi.fn(),
}));

const { updateBusinessIdentity } = await import("./business");
const { db } = await import("@/lib/db");
const { organization } = await import("@/lib/db/schema/auth-schema");
const { organizationSlugHistory } = await import(
  "@/lib/db/schema/business-schema"
);
const { currentSlugFor, isSlugReserved } = await import("@/lib/slug-history");

const ORG = "org_itest_identity";
const OTHER = "org_itest_identity_other";

const orgRow = (id: string) =>
  db.query.organization.findFirst({ where: eq(organization.id, id) });

beforeEach(async () => {
  for (const id of [ORG, OTHER]) {
    await db.delete(organization).where(eq(organization.id, id));
  }
  await db.insert(organization).values([
    { id: ORG, name: "Eski Ad", slug: "eski-adres", createdAt: new Date() },
    { id: OTHER, name: "Baska", slug: "alinmis-adres", createdAt: new Date() },
  ]);
  ownerMock.mockReset().mockResolvedValue({ organizationId: ORG });
});

afterAll(async () => {
  for (const id of [ORG, OTHER]) {
    await db.delete(organization).where(eq(organization.id, id));
  }
  await db.$client.end();
});

describe("updateBusinessIdentity", () => {
  it("renames the business and moves its address", async () => {
    const result = await updateBusinessIdentity({
      name: "Yeni Ad",
      slug: "yeni-adres",
    });

    expect(result).toBeUndefined();
    const row = await orgRow(ORG);
    expect(row?.name).toBe("Yeni Ad");
    expect(row?.slug).toBe("yeni-adres");
  });

  it("explains a collision instead of throwing a database error", async () => {
    const result = await updateBusinessIdentity({
      name: "Yeni Ad",
      slug: "alinmis-adres",
    });

    expect(result?.error).toMatch(/kullanılıyor/);
    // The failed save must not have renamed it either.
    expect((await orgRow(ORG))?.name).toBe("Eski Ad");
  });

  it("refuses a reserved address", async () => {
    const result = await updateBusinessIdentity({
      name: "Yeni Ad",
      slug: "panel",
    });

    expect(result?.error).toBeTruthy();
    expect((await orgRow(ORG))?.slug).toBe("eski-adres");
  });

  it("refuses an address that is not slug-shaped", async () => {
    for (const slug of ["Büyük Harf", "boşluk var", "-bas-tire", "ab"]) {
      const result = await updateBusinessIdentity({ name: "Yeni Ad", slug });
      expect(result?.error, slug).toBeTruthy();
    }
    expect((await orgRow(ORG))?.slug).toBe("eski-adres");
  });

  it("refuses a name that is too short", async () => {
    const result = await updateBusinessIdentity({ name: "A", slug: "yeni" });

    expect(result?.error).toBeTruthy();
    expect((await orgRow(ORG))?.name).toBe("Eski Ad");
  });

  it("touches only the caller's own organization", async () => {
    await updateBusinessIdentity({ name: "Yeni Ad", slug: "yeni-adres" });

    const other = await orgRow(OTHER);
    expect(other?.name).toBe("Baska");
    expect(other?.slug).toBe("alinmis-adres");
  });
});

describe("old addresses", () => {
  it("keep leading to the business after it moves", async () => {
    await updateBusinessIdentity({ name: "Eski Ad", slug: "yeni-adres" });

    expect(await currentSlugFor("eski-adres")).toBe("yeni-adres");
  });

  it("lead to the current address however many moves ago they were", async () => {
    await updateBusinessIdentity({ name: "Eski Ad", slug: "yeni-adres" });
    await updateBusinessIdentity({ name: "Eski Ad", slug: "en-yeni-adres" });

    expect(await currentSlugFor("eski-adres")).toBe("en-yeni-adres");
    expect(await currentSlugFor("yeni-adres")).toBe("en-yeni-adres");
  });

  it("stay reserved for the business that held them", async () => {
    await updateBusinessIdentity({ name: "Eski Ad", slug: "yeni-adres" });

    ownerMock.mockResolvedValue({ organizationId: OTHER });
    const result = await updateBusinessIdentity({
      name: "Baska",
      slug: "eski-adres",
    });

    expect(result?.error).toMatch(/kullanılıyor/);
    expect((await orgRow(OTHER))?.slug).toBe("alinmis-adres");
    expect(await isSlugReserved("eski-adres")).toBe(true);
    expect(await isSlugReserved("eski-adres", ORG)).toBe(false);
  });

  it("can be taken back by their own business", async () => {
    await updateBusinessIdentity({ name: "Eski Ad", slug: "yeni-adres" });
    const result = await updateBusinessIdentity({
      name: "Eski Ad",
      slug: "eski-adres",
    });

    expect(result).toBeUndefined();
    expect((await orgRow(ORG))?.slug).toBe("eski-adres");
    // Current again rather than history, and the address it left leads back.
    expect(await currentSlugFor("eski-adres")).toBeNull();
    expect(await currentSlugFor("yeni-adres")).toBe("eski-adres");
  });

  it("are not recorded when only the name changes", async () => {
    await updateBusinessIdentity({ name: "Yeni Ad", slug: "eski-adres" });

    const rows = await db
      .select()
      .from(organizationSlugHistory)
      .where(eq(organizationSlugHistory.organizationId, ORG));
    expect(rows).toHaveLength(0);
  });

  it("are not recorded when the move fails", async () => {
    await updateBusinessIdentity({ name: "Yeni Ad", slug: "alinmis-adres" });

    expect(await currentSlugFor("eski-adres")).toBeNull();
  });

  it("lead nowhere when they never existed", async () => {
    expect(await currentSlugFor("hic-olmamis-adres")).toBeNull();
    expect(await isSlugReserved("hic-olmamis-adres")).toBe(false);
  });
});
