import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { organization } from "@/lib/db/schema/auth-schema";
import { organizationSlugHistory } from "@/lib/db/schema/business-schema";

/**
 * Where an address a business moved away from leads now: that business's
 * current slug, or null if no business ever left it.
 *
 * One hop however many renames ago it was — history rows point at the
 * business, not at the next slug, so a chain of moves never needs following.
 */
export async function currentSlugFor(oldSlug: string): Promise<string | null> {
  const [row] = await db
    .select({ slug: organization.slug })
    .from(organizationSlugHistory)
    .innerJoin(
      organization,
      eq(organization.id, organizationSlugHistory.organizationId)
    )
    .where(eq(organizationSlugHistory.slug, oldSlug))
    .limit(1);
  return row?.slug ?? null;
}

/**
 * Whether an address is kept for a business that used to hold it — other
 * than `organizationId`, which may always take back its own.
 */
export async function isSlugReserved(
  slug: string,
  organizationId?: string
): Promise<boolean> {
  const [row] = await db
    .select({ slug: organizationSlugHistory.slug })
    .from(organizationSlugHistory)
    .where(
      organizationId
        ? and(
            eq(organizationSlugHistory.slug, slug),
            ne(organizationSlugHistory.organizationId, organizationId)
          )
        : eq(organizationSlugHistory.slug, slug)
    )
    .limit(1);
  return row !== undefined;
}
