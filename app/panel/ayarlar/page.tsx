import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/panel/page-header";
import { requireOwner } from "@/lib/auth-guard";
import { db } from "@/lib/db";
import { organization } from "@/lib/db/schema/auth-schema";
import { IdentityForm } from "./identity-form";
import { ProfileForm } from "./profile-form";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "Ayarlar" };

export default async function SettingsPage() {
  const { organizationId, profile } = await requireOwner();
  // requireOwner resolves the profile, not the organization row the name and
  // public address live on.
  const org = await db.query.organization.findFirst({
    where: eq(organization.id, organizationId),
    columns: { name: true, slug: true },
  });

  return (
    <div className="grid max-w-xl gap-10">
      <PageHeader
        title="Ayarlar"
        description="İşletmeniz ve randevu sayfanızın kuralları."
      />

      <section className="grid gap-4">
        <h2 className="font-display text-2xl">İşletme bilgileri</h2>
        <IdentityForm
          initial={{ name: org?.name ?? "", slug: org?.slug ?? "" }}
        />
      </section>

      <section className="grid gap-4">
        <h2 className="font-display text-2xl">Randevu sayfanız</h2>
        <ProfileForm
          initial={{
            phone: profile.phone ?? "",
            address: profile.address ?? "",
            description: profile.description ?? "",
          }}
        />
      </section>

      <section className="grid gap-4">
        <h2 className="font-display text-2xl">Randevu kuralları</h2>
        <SettingsForm
          initial={{
            timezone: profile.timezone,
            slotGranularityMinutes: profile.slotGranularityMinutes,
            minLeadTimeMinutes: profile.minLeadTimeMinutes,
            bookingWindowDays: profile.bookingWindowDays,
            contactEmail: profile.contactEmail,
            // The column is text and predates the single-currency rule, so a row
            // written earlier could still say usd. TRY is the only value the form
            // offers or updateSettings accepts, so asserting it here also
            // normalises such a row the next time settings are saved.
            currency: "try",
          }}
        />
      </section>
    </div>
  );
}
