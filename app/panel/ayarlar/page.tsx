import { requireOwner } from "@/lib/auth-guard";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "Ayarlar" };

export default async function SettingsPage() {
  const { profile } = await requireOwner();

  return (
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
  );
}
