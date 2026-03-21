/**
 * Реализация в `supabase/functions/_shared/recipeBenefitDescription.ts` — единый источник для UI и Edge.
 * Текст пользы универсальный (goals + seed); заголовок блока — отдельно в UI (`getBenefitLabel`).
 */
export {
  type BuildRecipeBenefitDescriptionInput,
  type NutritionGoal,
  BENEFIT_DESCRIPTION_MAX_LENGTH,
  buildRecipeBenefitDescription,
  pickPriorityAccentGoals,
  resolveBenefitDescriptionSeed,
} from "../../supabase/functions/_shared/recipeBenefitDescription.ts";
