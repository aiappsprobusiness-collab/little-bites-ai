/**
 * Audience label for recipe cards: derived from recipe.member_id + family members.
 * No dependency on selectedMember — only recipe data and members list.
 */

import { getAgeCategory } from "./ageCategory";

export type RecipeAudienceScope = "family" | "member" | "unknown";

export interface RecipeAudience {
  scope: RecipeAudienceScope;
  label: string;
  showChildEmoji: boolean;
}

/**
 * Resolves audience for a recipe from its member_id and the family members list.
 * - member_id == null → family recipe: "Для семьи", no child emoji.
 * - member_id set and member found → by age: "Для ребёнка" (with 👶) or "Для взрослого".
 * - member_id set but member not found → "Для кого подходит".
 */
export function getRecipeAudience(
  recipe: { member_id?: string | null },
  members: Array<{ id: string; age_months?: number | null }>
): RecipeAudience {
  const memberId = recipe.member_id ?? null;

  if (memberId == null || memberId === "") {
    return {
      scope: "family",
      label: "Для семьи",
      showChildEmoji: false,
    };
  }

  const member = members.find((m) => m.id === memberId);
  if (!member) {
    return {
      scope: "unknown",
      label: "Для кого подходит",
      showChildEmoji: false,
    };
  }

  const ageMonths = member.age_months != null && Number.isFinite(member.age_months) ? Number(member.age_months) : null;
  if (ageMonths == null || ageMonths < 0) {
    return {
      scope: "member",
      label: "Для кого подходит",
      showChildEmoji: false,
    };
  }

  const category = getAgeCategory(ageMonths);
  if (category === "adult") {
    return {
      scope: "member",
      label: "Для взрослого",
      showChildEmoji: false,
    };
  }

  return {
    scope: "member",
    label: "Для ребёнка",
    showChildEmoji: true,
  };
}
