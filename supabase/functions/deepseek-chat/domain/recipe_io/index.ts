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
  sanitizeRecipeText,
  sanitizeMealMentions,
  getMinimalRecipe,
  DESCRIPTION_MAX_LENGTH,
  DESCRIPTION_QUALITY_MIN_LENGTH,
  DESCRIPTION_QUALITY_TWO_SENTENCE_MIN_LENGTH,
  DESCRIPTION_TITLE_ANCHOR_MIN_STRONG_TOKENS,
  extractStrongTitleTokensForDescriptionAnchoring,
  descriptionHasProfileAdaptationLeak,
  descriptionPassesTitleAnchoringHeuristic,
  CHEF_ADVICE_MAX_LENGTH,
  enforceDescription,
  enforceChefAdvice,
  buildDescriptionFallback,
  buildChefAdviceFallback,
  hasForbiddenChefAdviceStart,
  getChefAdviceForbiddenStartKind,
  type ChefAdviceForbiddenStartKind,
  sanitizeDescriptionForPool,
  sanitizeChefAdviceForPool,
  passesDescriptionQualityGate,
  passesChefAdviceQualityGate,
  prepareChefAdvicePipeline,
  isChefAdviceDebugEnabled,
  pickCanonicalDescription,
  explainCanonicalDescriptionRejection,
  explainChefAdviceRejectionWhenNull,
  detectDescriptionDishType,
} from "./sanitizeAndRepair.ts";

export { repairChatRecipeDescription, repairDescriptionOnly } from "./chatDescriptionRepair.ts";
export {
  resolveChatRecipeCanonicalDescription,
  type ChatCanonicalDescriptionSource,
  type ResolveChatRecipeDescriptionResult,
} from "./resolveChatRecipeCanonicalDescription.ts";
export { buildEmergencyChatRecipeDescription } from "./chatEmergencyDescription.ts";

export { isChefAdviceLowValue } from "./chefAdviceQuality.ts";
export { isChatDescriptionDebugEnabled } from "./chatDescriptionDebug.ts";
