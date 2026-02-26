/**
 * Soft preferences for plan generation (e.g. "любит ягоды" → ~25% berry recipes per week).
 * Used by generate-plan pickFromPool after allergy/mealType/lunch-soup filters.
 */

/** Токены для определения рецепта с ягодами (подстроки в title/description/tags/ingredients). */
const BERRY_TOKENS = [
  "ягод",
  "черник",
  "малина",
  "клубник",
  "смородин",
  "землян",
  "ежевик",
  "berry",
  "berries",
  "blueberry",
  "raspberry",
  "strawberry",
  "blackcurrant",
  "blackberry",
];

export interface SoftPrefs {
  berriesLiked: boolean;
}

/** Минимальный рецепт для проверки (title + опционально description, tags, ingredients). */
export interface RecipeForBerryCheck {
  title?: string | null;
  description?: string | null;
  tags?: string[] | null;
  recipe_ingredients?: Array<{ name?: string; display_text?: string }> | null;
}

/**
 * Извлекает мягкие предпочтения из профиля/члена семьи.
 * Читает member.likes (приоритет); при пустых likes — fallback на member.preferences.
 */
export function extractSoftPrefs(member: {
  likes?: string[] | null;
  preferences?: string[] | null;
} | null | undefined): SoftPrefs {
  const likes = member?.likes;
  const prefs = Array.isArray(likes) && likes.length > 0 ? likes : member?.preferences;
  if (!Array.isArray(prefs) || prefs.length === 0) {
    return { berriesLiked: false };
  }
  const joined = prefs.map((p) => String(p).toLowerCase().trim()).join(" ");
  const berriesLiked =
    /\b(любит\s+ягод|ягод[ыау]|berries?)\b/.test(joined) ||
    /любит\s+ягод/.test(joined);
  return { berriesLiked };
}

export interface ShouldFavorBerriesParams {
  /** Индекс слота в неделе (0-based). */
  slotIndex: number;
  /** Индекс дня (0-based), опционально для расширений. */
  dayIndex?: number;
  /** Целевая доля слотов с ягодами (по умолчанию 0.25 = 25%). */
  targetRatio?: number;
  /** Уже подобранное количество рецептов с ягодами в этой неделе. */
  alreadyBerryCount: number;
  /** Общее число уже заполненных слотов (можно использовать как slotIndex, если совпадает). */
  totalPicked?: number;
}

/**
 * Решает, нужно ли в текущем слоте предпочитать рецепт с ягодами,
 * чтобы в итоге ~targetRatio слотов были с ягодами.
 * При total=4 и target=0.25 целится в 1 berry slot; при total=8 — в 2.
 */
export function shouldFavorBerries(params: ShouldFavorBerriesParams): boolean {
  const {
    slotIndex,
    targetRatio = 0.25,
    alreadyBerryCount,
  } = params;
  const desiredByNow = Math.floor((slotIndex + 1) * targetRatio);
  return alreadyBerryCount < desiredByNow;
}

/**
 * Проверяет, является ли рецепт «ягодным» по title/description/tags/ingredients.
 */
export function isBerryRecipe(recipe: RecipeForBerryCheck | null | undefined): boolean {
  if (!recipe) return false;
  const title = (recipe.title ?? "").toLowerCase();
  const description = (recipe.description ?? "").toLowerCase();
  const tagsText = (recipe.tags ?? []).join(" ").toLowerCase();
  const ingredientsText = (recipe.recipe_ingredients ?? [])
    .map((ri) => [ri.name ?? "", ri.display_text ?? ""].join(" "))
    .join(" ")
    .toLowerCase();
  const text = [title, description, tagsText, ingredientsText].join(" ");
  return BERRY_TOKENS.some((tok) => text.includes(tok));
}
