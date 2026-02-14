/**
 * Age category for UI labels (mirrors supabase/functions/deepseek-chat/ageCategory.ts).
 * Used e.g. for recipe benefit caption: "Польза для ребёнка" vs "Польза для взрослого".
 */

export type AgeCategory = "infant" | "toddler" | "school" | "adult";

/** Returns age category from age in months. Same thresholds as Edge Function. */
export function getAgeCategory(ageMonths: number): AgeCategory {
  if (ageMonths <= 12) return "infant";
  if (ageMonths <= 60) return "toddler";
  if (ageMonths <= 216) return "school";
  return "adult";
}

/** Returns the benefit section caption for recipe card by target member age. */
export function getBenefitLabel(ageMonths: number | null | undefined): string {
  if (ageMonths == null || !Number.isFinite(ageMonths) || ageMonths < 0) {
    return "Почему это полезно";
  }
  const category = getAgeCategory(ageMonths);
  if (category === "adult") {
    return "Польза для взрослого";
  }
  return "Польза для ребёнка";
}

/** Label + emoji for "Для кого" row (favorites card/sheet). adult: no child emoji; child: 👶; unknown: neutral. */
export function getTargetAudienceLabel(ageMonths: number | null | undefined): { label: string; showChildEmoji: boolean } {
  if (ageMonths == null || !Number.isFinite(ageMonths) || ageMonths < 0) {
    return { label: "Для кого подходит", showChildEmoji: false };
  }
  const category = getAgeCategory(ageMonths);
  if (category === "adult") {
    return { label: "Для взрослого", showChildEmoji: false };
  }
  return { label: "Для ребёнка", showChildEmoji: true };
}
