import { asc, eq } from "drizzle-orm";
import { requireOwner } from "@/lib/auth-guard";
import { db } from "@/lib/db";
import { availabilityRules } from "@/lib/db/schema/availability-schema";
import { AvailabilityEditor } from "./availability-editor";

export const metadata = { title: "Availability" };

export default async function AvailabilityPage() {
  const { organizationId } = await requireOwner();
  const rules = await db.query.availabilityRules.findMany({
    where: eq(availabilityRules.organizationId, organizationId),
    orderBy: [
      asc(availabilityRules.weekday),
      asc(availabilityRules.startMinutes),
    ],
  });

  return (
    <AvailabilityEditor
      initialRules={rules.map((r) => ({
        weekday: r.weekday,
        startMinutes: r.startMinutes,
        endMinutes: r.endMinutes,
      }))}
    />
  );
}
