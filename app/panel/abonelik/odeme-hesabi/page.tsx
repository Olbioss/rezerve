import { eq } from "drizzle-orm";
import { requireOwner } from "@/lib/auth-guard";
import { IS_TEST_MODE, TEST_PAYOUT_DEFAULTS } from "@/lib/billing/test-mode";
import { db } from "@/lib/db";
import { organization } from "@/lib/db/schema/auth-schema";
import { PayoutForm, type PayoutFormState } from "./payout-form";

export const metadata = { title: "Ödeme hesabı" };

export default async function PayoutAccountPage() {
  const { session, organizationId, profile, billing } = await requireOwner();
  const account = billing.payoutAccount;

  const org = await db.query.organization.findFirst({
    where: eq(organization.id, organizationId),
  });

  // Test-mode prefill only helps on a blank form; never overwrite real input.
  const testDefaults = IS_TEST_MODE && !account ? TEST_PAYOUT_DEFAULTS : null;

  const initial: PayoutFormState = {
    merchantType: account?.merchantType ?? "personal",
    name: account?.name ?? org?.name ?? "",
    email: account?.email ?? profile.contactEmail ?? session.user.email,
    gsmNumber: account?.gsmNumber ?? testDefaults?.gsmNumber ?? "",
    address: account?.address ?? testDefaults?.address ?? "",
    iban: account?.iban ?? testDefaults?.iban ?? "",
    contactName: account?.contactName ?? session.user.name?.split(" ")[0] ?? "",
    contactSurname:
      account?.contactSurname ??
      session.user.name?.split(" ").slice(1).join(" ") ??
      "",
    legalCompanyTitle: account?.legalCompanyTitle ?? org?.name ?? "",
    taxOffice: account?.taxOffice ?? testDefaults?.taxOffice ?? "",
    identityNumber:
      account?.identityNumber ?? testDefaults?.identityNumber ?? "",
    taxNumber: account?.taxNumber ?? testDefaults?.taxNumber ?? "",
  };

  return (
    <PayoutForm
      initial={initial}
      status={account?.status ?? "none"}
      lastError={account?.lastError ?? null}
      isTestMode={IS_TEST_MODE}
      isPro={billing.plan === "pro"}
    />
  );
}
