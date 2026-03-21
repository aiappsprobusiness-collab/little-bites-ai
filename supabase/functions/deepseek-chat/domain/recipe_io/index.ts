/**
 * Домен: парсинг/валидация/retry рецепта, описание/совет шефа, ремонт и санитизация.
 */

export { validateRecipe } from "../../../_shared/parsing/index.ts";
export type { ValidateRecipeResult } from "../../../_shared/parsing/validateRecipe.ts";
export { retryFixJson } from "../../../_shared/parsing/retryFixJson.ts";
export type { RetryFixJsonOptions, RetryFixJsonResult } from "../../../_shared/parsing/retryFixJson.ts";

export {
  buildRecipeDescription,
  buildChefAdvice,
  shouldReplaceDescription,
  shouldReplaceChefAdvice,
} from "../../../_shared/recipeCopy.ts";

export {
  isDescriptionIncomplete,
  isDescriptionInvalid,
  repairDescriptionOnly,
  sanitizeRecipeText,
  sanitizeMealMentions,
  getMinimalRecipe,
  DESCRIPTION_MAX_LENGTH,
  CHEF_ADVICE_MAX_LENGTH,
  enforceDescription,
  enforceChefAdvice,
  buildDescriptionFallback,
  buildChefAdviceFallback,
  hasForbiddenChefAdviceStart,
  sanitizeDescriptionForPool,
  sanitizeChefAdviceForPool,
  passesDescriptionQualityGate,
  passesChefAdviceQualityGate,
  prepareChefAdvicePipeline,
  isChefAdviceDebugEnabled,
} from "./sanitizeAndRepair.ts";

export { isChefAdviceLowValue } from "./chefAdviceQuality.ts";
