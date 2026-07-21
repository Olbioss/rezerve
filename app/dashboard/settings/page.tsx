import { requireOwner } from "@/lib/auth-guard";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "Settings" };

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
        currency: profile.currency as "usd" | "eur" | "gbp" | "try",
      }}
    />
  );
}
