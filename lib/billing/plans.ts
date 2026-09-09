/**
 * Plan catalogue — the single source for both the landing pricing section and
 * the billing page, so marketing copy and enforcement cannot drift apart.
 *
 * Deliberately dependency-free (no "server-only") so client components and
 * app/page.tsx can import it.
 */

export type Plan = "free" | "pro";

/** The only gated capability today. Kept as a union so adding one is typed. */
export type Feature = "onlineDeposit";

export const PRO_PRICE_CENTS = 29_900;
export const TRIAL_DAYS = 14;

export type PlanDefinition = {
  name: string;
  priceCents: number;
  /** Shown under the price, e.g. "/ay". Empty for the free plan. */
  interval: string;
  tagline: string;
  features: Feature[];
  bullets: string[];
  footnote: string;
};

export const PLANS: Record<Plan, PlanDefinition> = {
  free: {
    name: "Ücretsiz",
    priceCents: 0,
    interval: "",
    tagline: "Randevu almaya bugün başlayın.",
    features: [],
    bullets: [
      "Kendi randevu sayfanız",
      "Sınırsız hizmet",
      "Haftalık çalışma saatleri",
      "E-posta bildirimleri",
      "Randevu paneli",
    ],
    // True on this plan — the Pro trial does ask for a card up front.
    footnote: "Kredi kartı gerekmez.",
  },
  pro: {
    name: "Pro",
    priceCents: PRO_PRICE_CENTS,
    interval: "/ay",
    tagline: "Ücretsiz'deki her şey, artı online kapora.",
    features: ["onlineDeposit"],
    bullets: [
      "Online kapora tahsilatı",
      "Kapora doğrudan sizin hesabınıza geçer",
      "Komisyon almıyoruz",
      "Boşa çıkan randevuları azaltın",
    ],
    footnote: `${TRIAL_DAYS} gün ücretsiz deneme.`,
  },
};

export function planHasFeature(plan: Plan, feature: Feature): boolean {
  return PLANS[plan].features.includes(feature);
}
