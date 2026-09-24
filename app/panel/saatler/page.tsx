import { asc, eq } from "drizzle-orm";
import { requireOwner } from "@/lib/auth-guard";
import {
  getDateExceptions,
  localDateISO,
} from "@/lib/booking/get-available-slots";
import { db } from "@/lib/db";
import { availabilityRules } from "@/lib/db/schema/availability-schema";
import { AvailabilityEditor } from "./availability-editor";
import { ExceptionsEditor } from "./exceptions-editor";

export const metadata = { title: "Çalışma Saatleri" };

export default async function AvailabilityPage() {
  const { organizationId, profile } = await requireOwner();
  const todayISO = localDateISO(new Date(), profile.timezone);

  const [rules, upcoming] = await Promise.all([
    db.query.availabilityRules.findMany({
      where: eq(availabilityRules.organizationId, organizationId),
      orderBy: [
        asc(availabilityRules.weekday),
        asc(availabilityRules.startMinutes),
      ],
    }),
    // Anything still to come, including one already under way.
    getDateExceptions(organizationId, todayISO, "9999-12-31"),
  ]);

  return (
    <div className="grid gap-14">
      <AvailabilityEditor
        initialRules={rules.map((r) => ({
          weekday: r.weekday,
          startMinutes: r.startMinutes,
          endMinutes: r.endMinutes,
        }))}
      />
      <ExceptionsEditor upcoming={upcoming} todayISO={todayISO} />
    </div>
  );
}
