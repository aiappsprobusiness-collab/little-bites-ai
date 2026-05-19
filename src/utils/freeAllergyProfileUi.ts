/**
 * UI-политика Free: одна аллергия на профиль при создании/редактировании в онбординге.
 * Paywall — только по явному CTA, не при каждом вводе.
 */

export function isFreeSingleAllergyLimitReached(
  hasAccess: boolean,
  allergyCount: number,
): boolean {
  return !hasAccess && allergyCount >= 1;
}

export type OpenOnboardingSecondAllergyPaywall = {
  setPaywallReason: (reason: string | null) => void;
  setPaywallCustomMessage: (message: string | null) => void;
  setShowPaywall: (open: boolean) => void;
};

export function openOnboardingSecondAllergyPaywall(actions: OpenOnboardingSecondAllergyPaywall): void {
  actions.setPaywallReason("onboarding_second_allergy_free");
  actions.setPaywallCustomMessage(null);
  actions.setShowPaywall(true);
}
