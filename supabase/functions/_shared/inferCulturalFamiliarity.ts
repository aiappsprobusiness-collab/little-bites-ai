/**
 * Детерминированная эвристика familiarity для Stage 4.4 (без LLM).
 * Дублируется в src/utils/inferCulturalFamiliarity.ts — правки вносить в оба файла.
 * SQL-аналог: public.infer_cultural_familiarity(text) в миграции.
 *
 * locale не используется — только cuisine (slug/строка).
 */

export type CulturalFamiliarity = "classic" | "adapted" | "specific";

/** Нормализация ключа: trim, lower, пробелы → underscore. */
export function normalizeCuisineKey(cuisine: string): string {
  return cuisine
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

/**
 * «Широко понятные» / нейтральные / дефолтные ярлыки → classic.
 * Расширяйте массивы по мере необходимости.
 */
export const CUISINE_CLASSIC_KEYS: readonly string[] = [
  "neutral",
  "common",
  "international",
  "everyday",
  "home",
  "family",
  "default",
  "local_default",
  "default_local",
  "generic",
  "simple",
  "comfort",
  "home_cooking",
  "russian",
  "ukrainian",
  "belarusian",
  "post_soviet",
  "cis",
];

/** Узкие / нишевые / сильно этнические → specific (перед проверкой adapted). */
export const CUISINE_SPECIFIC_KEYS: readonly string[] = [
  "ethiopian",
  "eritrean",
  "somali",
  "nepalese",
  "bhutanese",
  "laotian",
  "mongolian",
  "niche",
  "regional_ethnic_specialty",
  "deeply_regional",
  "indigenous",
  "ethnic_niche",
];

/**
 * Широко известные кухни, но не «дефолтная домашняя» для массовой аудитории → adapted.
 */
export const CUISINE_ADAPTED_KEYS: readonly string[] = [
  "italian",
  "american",
  "french",
  "mexican",
  "chinese",
  "japanese",
  "indian",
  "thai",
  "vietnamese",
  "korean",
  "spanish",
  "greek",
  "turkish",
  "lebanese",
  "mediterranean",
  "british",
  "german",
  "polish",
  "persian",
  "georgian",
  "armenian",
  "azerbaijani",
  "uzbek",
  "israeli",
  "moroccan",
  "tunisian",
  "egyptian",
  "syrian",
  "iraqi",
  "iranian",
  "pakistani",
  "bangladeshi",
  "indonesian",
  "malaysian",
  "filipino",
  "brazilian",
  "peruvian",
  "cuban",
  "caribbean",
  "scandinavian",
  "dutch",
  "austrian",
  "swiss",
  "portuguese",
  "australian",
  "canadian",
  "fusion",
  "middle_eastern",
  "asian",
  "european",
  "latin_american",
  "african",
];

function inSet(key: string, set: readonly string[]): boolean {
  return set.includes(key);
}

/**
 * @param cuisine — опциональная строка/ slug кухни (не locale).
 * @returns classic | adapted | specific; при отсутствии cuisine → adapted.
 */
export function inferCulturalFamiliarity(cuisine: string | null | undefined): CulturalFamiliarity {
  if (cuisine == null || String(cuisine).trim() === "") {
    return "adapted";
  }
  const k = normalizeCuisineKey(String(cuisine));
  if (inSet(k, CUISINE_CLASSIC_KEYS)) return "classic";
  if (inSet(k, CUISINE_SPECIFIC_KEYS)) return "specific";
  if (inSet(k, CUISINE_ADAPTED_KEYS)) return "adapted";
  return "adapted";
}
