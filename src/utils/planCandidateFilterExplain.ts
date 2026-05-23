/**
 * Dev/тесты: почему кандидат пула отсеян на клиенте (паритет с filterPoolCandidatesForSlot до прикорма).
 * Не для production UI.
 */

import { buildBlockedTokensFromAllergies } from "@/utils/allergyAliases";
import { containsAnyToken } from "@/shared/allergensDictionary";
import {
  listAllergyTokenHitsInPlanIngredientNames,
} from "@/shared/recipeAllergyMatch";
import {
  getSanityBlockedReasons,
  isSoupLikeTitle,
  memberHasDislikesForPool,
  normalizeMealType,
  normalizeTitleKey,
  passesProfileFilter,
  recipeFitsAgeMonthsRow,
  resolveInfantSlotRoleForPool,
  tokenize,
  type FilterPoolCandidatesForSlotOptions,
  type MealType,
  type PoolRecipeRow,
} from "@/utils/recipePool";

export type PlanCandidateFilterBucket =
  | "passed"
  | "excluded_by_recipe_id"
  | "excluded_by_title_key"
  | "excluded_by_meal_type"
  | "excluded_by_soup_rule"
  | "excluded_by_sanity"
  | "excluded_by_age"
  | "excluded_by_allergy"
  | "excluded_by_dislike";

export type ExplainPoolCandidateRejectionResult = {
  bucket: PlanCandidateFilterBucket;
  /** Коротко: id причины sanity, имя токена и т.д. */
  detail?: string;
  /** Для аллергий: попадание по полю */
  allergyHits?: ReturnType<typeof listAllergyTokenHitsInPlanIngredientNames>;
};

const AGE_RESTRICTED_TOKENS = ["остр", "кофе", "гриб"];

/**
 * Те же шаги, что `filterPoolCandidatesForSlot`, до блоков прикорма (secondary/primary complementary).
 * Если вернулось `passed`, кандидат всё ещё может отсеяться правилами прикорма — смотрите bucket infant.
 */
export function explainPoolCandidateRejection(
  recipe: PoolRecipeRow,
  options: FilterPoolCandidatesForSlotOptions,
): ExplainPoolCandidateRejectionResult {
  const { slotNorm, memberData, excludeRecipeIds, excludeTitleKeys, infantSlotRole } = options;
  const excludeSet = new Set(excludeRecipeIds);
  if (excludeSet.has(recipe.id)) {
    return { bucket: "excluded_by_recipe_id", detail: recipe.id };
  }

  const excludeTitleSet = new Set(excludeTitleKeys.map((k) => k.toLowerCase().trim()).filter(Boolean));
  const titleKey = normalizeTitleKey(recipe.title);
  if (excludeTitleSet.has(titleKey)) {
    return { bucket: "excluded_by_title_key", detail: titleKey };
  }

  const ageMonths = memberData?.age_months ?? (memberData?.age_years != null ? memberData.age_years * 12 : null);
  const role = resolveInfantSlotRoleForPool(slotNorm, memberData ?? null, infantSlotRole ?? null);
  const infantComplementaryUnifiedPool =
    ageMonths != null && ageMonths < 12 && (role === "primary" || role === "secondary");

  const recNorm = normalizeMealType(recipe.meal_type);
  if (recNorm === null) {
    return { bucket: "excluded_by_meal_type", detail: "unknown_meal_type" };
  }
  if (!infantComplementaryUnifiedPool && recNorm !== slotNorm) {
    return { bucket: "excluded_by_meal_type", detail: `${recNorm}_vs_slot_${slotNorm}` };
  }

  if (ageMonths != null && ageMonths < 12) {
    if (
      !recipeFitsAgeMonthsRow(recipe.min_age_months ?? null, recipe.max_age_months ?? null, ageMonths)
    ) {
      return {
        bucket: "excluded_by_age",
        detail: `min_max_months:${recipe.min_age_months ?? "null"}_${recipe.max_age_months ?? "null"}_age_${ageMonths}`,
      };
    }
  }

  const mealSlotFiltersNorm: MealType = infantComplementaryUnifiedPool ? "snack" : slotNorm;

  if (!infantComplementaryUnifiedPool && slotNorm === "breakfast" && isSoupLikeTitle(recipe.title)) {
    return { bucket: "excluded_by_soup_rule", detail: "soup_like_on_breakfast" };
  }

  const sanity = getSanityBlockedReasons(recipe.title, mealSlotFiltersNorm);
  if (sanity.length > 0) {
    return { bucket: "excluded_by_sanity", detail: sanity.join(",") };
  }

  const profile = passesProfileFilter(recipe, memberData);
  if (!profile.pass) {
    if (profile.reason === "allergy") {
      const tokens = buildBlockedTokensFromAllergies(
        Array.isArray(memberData?.allergies)
          ? memberData!.allergies
          : memberData?.allergies
            ? [String(memberData.allergies)]
            : [],
      );
      const allergyHits = listAllergyTokenHitsInPlanIngredientNames(recipe.recipe_ingredients, tokens);
      return {
        bucket: "excluded_by_allergy",
        detail: allergyHits[0]?.token ?? "allergy",
        allergyHits,
      };
    }
    if (profile.reason === "preference") {
      return { bucket: "excluded_by_dislike", detail: "dislike_token_match" };
    }
    if (profile.reason === "age") {
      const text = [recipe.title, recipe.description ?? "", (recipe.tags ?? []).join(" ")].join(" ");
      const hit = containsAnyToken(text, AGE_RESTRICTED_TOKENS);
      return { bucket: "excluded_by_age", detail: hit.found[0] ?? "under36_restricted" };
    }
  }

  return { bucket: "passed" };
}

/** Детальный отчёт по аллергиям (токены + ingredient names), без остальных фильтров плана. */
export function explainAllergyFilterOnRecipe(
  recipe: Pick<PoolRecipeRow, "title" | "description" | "tags" | "recipe_ingredients">,
  allergies: string[] | null | undefined,
  _opts?: { includeTags?: boolean; includeIngredients?: boolean },
): {
  blockedTokens: string[];
  allowed: boolean;
  hits: ReturnType<typeof listAllergyTokenHitsInPlanIngredientNames>;
} {
  const blockedTokens = buildBlockedTokensFromAllergies(allergies);
  const hits = listAllergyTokenHitsInPlanIngredientNames(recipe.recipe_ingredients, blockedTokens);
  const allowed = hits.length === 0;
  return { blockedTokens, allowed, hits };
}

/** Токены dislike (как в recipePool), для отладки. */
export function debugDislikeTokensFromMember(memberData: FilterPoolCandidatesForSlotOptions["memberData"]): string[] {
  if (!memberHasDislikesForPool(memberData ?? null)) return [];
  const list = memberData?.dislikes;
  const arr = Array.isArray(list) ? list : list ? [String(list)] : [];
  const tokens = new Set<string>();
  for (const item of arr) {
    const s = String(item).trim().toLowerCase();
    if (!s) continue;
    for (const t of tokenize(s)) tokens.add(t);
  }
  return [...tokens];
}
