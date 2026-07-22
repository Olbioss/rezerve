import { asc, eq } from "drizzle-orm";
import { requireOwner } from "@/lib/auth-guard";
import { db } from "@/lib/db";
import { services } from "@/lib/db/schema/service-schema";
import { ServicesManager } from "./services-manager";

export const metadata = { title: "Hizmetler" };

export default async function ServicesPage() {
  const { organizationId, profile } = await requireOwner();
  const rows = await db.query.services.findMany({
    where: eq(services.organizationId, organizationId),
    orderBy: [asc(services.createdAt)],
  });

  return (
    <ServicesManager
      services={rows.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        durationMinutes: s.durationMinutes,
        priceCents: s.priceCents,
        depositCents: s.depositCents,
        active: s.active,
      }))}
      currency={profile.currency}
    />
  );
}
