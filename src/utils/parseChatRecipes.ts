/**
 * Утилиты для парсинга рецептов из ответов AI в чате
 */
import { safeLog, safeWarn } from "./safeLogger";
import { getAdviceSectionTitle, isInfantRecipe } from "./infantRecipe";

/** Ингредиент (контракт AI: displayText, canonical). */
export interface IngredientWithSubstitute {
  name: string;
  display_text?: string | null;
  amount?: string;
  canonical_amount?: number | null;
  canonical_unit?: "g" | "ml" | null;
  substitute?: string;
}

export type ParsedIngredient = string | IngredientWithSubstitute;

export interface ParsedRecipe {
  id?: string;
  title: string;
  description?: string;
  ingredients: ParsedIngredient[];
  steps: string[];
  cookingTime?: number;
  mealType?: 'breakfast' | 'lunch' | 'snack' | 'dinner';
  /** Совет от шефа (Premium). */
  chefAdvice?: string;
  /** Мини-совет (Free, поле advice в JSON). */
  advice?: string;
  min_age_months?: number | null;
  max_age_months?: number | null;
  /** КБЖУ на порцию (от API/БД). Отображаются только для Premium/Trial. */
  calories?: number | null;
  proteins?: number | null;
  fats?: number | null;
  carbs?: number | null;
  /** Stage 4: цели питания (whitelist), с бэка / из JSON ответа. */
  nutrition_goals?: string[] | null;
  /** Порции, под которые даны количества ингредиентов (из JSON или с клиента). */
  servings?: number | null;
}

/** Проверка: элемент ингредиента — объект с полем name (Premium-формат). */
export function isIngredientObject(ing: ParsedIngredient): ing is IngredientWithSubstitute {
  return typeof ing === 'object' && ing !== null && 'name' in ing && typeof (ing as IngredientWithSubstitute).name === 'string';
}

/** Извлекает chefAdvice из объекта, проверяя все возможные ключи (chefAdvice, chef_advice, chefAdviceText). */
export function extractChefAdvice(obj: Record<string, unknown>): string | undefined {
  const val = obj.chefAdvice ?? obj.chef_advice ?? obj.chefAdviceText;
  return typeof val === "string" && val.trim() ? val.trim() : undefined;
}

/** Извлекает advice из объекта. */
export function extractAdvice(obj: Record<string, unknown>): string | undefined {
  const val = obj.advice;
  return typeof val === "string" && val.trim() ? val.trim() : undefined;
}

/** Число из JSON модели (иногда приходит строкой). */
function asFiniteNumberField(v: unknown): number | undefined {
  if (v == null) return undefined;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const t = v.trim().replace(",", ".");
    if (t === "") return undefined;
    const n = Number(t);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function extractNutritionFields(obj: Record<string, unknown>): Pick<ParsedRecipe, "calories" | "proteins" | "fats" | "carbs"> {
  const nutrition = obj.nutrition as {
    kcal_per_serving?: unknown;
    protein_g_per_serving?: unknown;
    fat_g_per_serving?: unknown;
    carbs_g_per_serving?: unknown;
  } | undefined;

  const kcalTop = asFiniteNumberField(obj.calories);
  const kcalNut = nutrition != null ? asFiniteNumberField(nutrition.kcal_per_serving) : undefined;
  const kcal = kcalTop ?? (kcalNut != null ? Math.round(kcalNut) : undefined);

  const protTop = asFiniteNumberField(obj.proteins);
  const protNut = nutrition != null ? asFiniteNumberField(nutrition.protein_g_per_serving) : undefined;

  const fatTop = asFiniteNumberField(obj.fats);
  const fatNut = nutrition != null ? asFiniteNumberField(nutrition.fat_g_per_serving) : undefined;

  const carbTop = asFiniteNumberField(obj.carbs);
  const carbNut = nutrition != null ? asFiniteNumberField(nutrition.carbs_g_per_serving) : undefined;

  return {
    calories: kcal,
    proteins: protTop ?? protNut,
    fats: fatTop ?? fatNut,
    carbs: carbTop ?? carbNut,
  };
}

/** nutrition_goals из ответа API / JSON (camelCase или snake_case). */
export function extractNutritionGoals(obj: Record<string, unknown>): string[] | undefined {
  const raw = obj.nutrition_goals ?? obj.nutritionGoals;
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out = raw.filter((g): g is string => typeof g === "string").map((g) => g.trim()).filter(Boolean);
  return out.length ? out : undefined;
}

/** Текст ингредиента для отображения. Приоритет: display_text > "name — amount" > name. */
export function ingredientDisplayText(ing: ParsedIngredient | { name?: string; display_text?: string | null; amount?: string }): string {
  if (typeof ing === 'string') return ing;
  const dt = (ing as { display_text?: string | null }).display_text;
  if (typeof dt === 'string' && dt.trim()) return dt.trim();
  const a = (ing as IngredientWithSubstitute).amount?.trim();
  return a ? `${(ing as IngredientWithSubstitute).name} — ${a}` : (ing as IngredientWithSubstitute).name ?? '';
}

function generateTempRecipeId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `temp-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

// Глаголы действия — такие строки считаем шагами приготовления, не ингредиентами.
// Проверка по целым словам, чтобы "для жарки" в "Растительное масло — для жарки" не считалась шагом.
const ACTION_VERBS = [
  'нарезать', 'варить', 'обжарить', 'тушить', 'добавить', 'смешать', 'залить', 'положить',
  'взять', 'нагреть', 'готовить', 'размять', 'запечь', 'выложить', 'посолить', 'поперчить',
  'помешать', 'довести', 'остудить', 'подавать', 'украсить', 'промыть', 'очистить', 'натереть',
  'измельчить', 'отварить', 'пассеровать', 'запекать', 'выпекать', 'обжаривать', 'тушить',
  'довести до кипения', 'снять с огня', 'оставить на', 'перемешать', 'взбить', 'нарезать',
  'посыпать', 'полить', 'смазать', 'выложить', 'подать',
  'очисть', 'натри', 'отожми', 'сформируй', 'выкладывай', 'перемешай', 'разогрей',
  'подавай', 'посыпь',
];

// Фразы-маркеры инструкции (не продукт для покупки)
const INSTRUCTION_PHRASES = ['перед подачей', 'по вкусу', 'по желанию', 'для подачи', 'при подаче'];

// Предлоги/назначение: "Масло — для жарки" не должно считаться шагом
const PREPOSITION_PURPOSE = ['для жарки', 'для подачи', 'по вкусу', 'по желанию'];

export function isInstruction(content: string): boolean {
  const t = content.trim();
  if (t.length <= 50) return false;
  // Запятая в середине — признак инструкции (перечисление действий)
  if (/,.{2,},/.test(t) || (t.includes(',') && t.length > 50)) return true;
  return false;
}

/** Проверка по целым словам: глагол должен быть отдельным словом (чтобы "для жарки" не матчилось). */
export function containsActionVerb(content: string): boolean {
  const lower = content.toLowerCase().trim();
  const words: string[] = lower.match(/[\p{L}\-]+/gu) ?? [];
  return ACTION_VERBS.some((v) => words.includes(v as string));
}

/** Строка начинается с повелительного глагола (команда) — гарантированно шаг. */
function startsWithActionVerb(content: string): boolean {
  const lower = content.toLowerCase().trim();
  const firstWord = lower.match(/^[\p{L}\-]+/u)?.[0] ?? '';
  return firstWord.length > 0 && ACTION_VERBS.includes(firstWord);
}

/** Глагол действия есть в первой половине предложения — это команда, шаг. */
function hasActionVerbInFirstHalf(content: string): boolean {
  const half = content.slice(0, Math.ceil(content.length / 2));
  return containsActionVerb(half);
}

/** Строка с "—" или ":" и только назначением (для жарки, по вкусу) — ингредиент, не шаг. */
function isIngredientWithPrepositionPurpose(content: string): boolean {
  const lower = content.toLowerCase();
  const hasDashOrColon = content.includes('—') || content.includes(':');
  const hasPurposePhrase = PREPOSITION_PURPOSE.some((p) => lower.includes(p));
  return hasDashOrColon && hasPurposePhrase && !startsWithActionVerb(content);
}

export function looksLikeInstructionPhrase(content: string): boolean {
  const lower = content.toLowerCase();
  return INSTRUCTION_PHRASES.some((p) => lower.includes(p));
}

/**
 * Парсит один рецепт из обычного текста (без JSON).
 * Ингредиенты — ТОЛЬКО из раздела "Ингредиенты"/"Список продуктов" или короткие строки с цифрой/буллетом без глаголов действия.
 * Длинные строки с запятыми и глаголы действия — в шаги, не в список покупок.
 */
export function parseRecipeFromPlainText(text: string): ParsedRecipe | null {
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  let title = '';
  const ingredients: string[] = [];
  const steps: string[] = [];
  let foundTitle = false;
  let inIngredientsSection = false;
  let inStepsSection = false;

  const excludeTitleWords = ['ингредиент', 'приготовление', 'шаг', 'способ', 'рецепт', 'блюдо', 'вариант', 'для'];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();

    // Название: первая строка с эмодзи, капсом или короткая без цифры в начале
    if (!foundTitle && line.length >= 2 && line.length <= 80) {
      const hasEmoji = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}]/u.test(line);
      const startsWithCaps = /^[А-ЯЁA-Z]/.test(line);
      const notNumbered = !/^\d+[\.\)]\s*/.test(line);
      const notExcluded = !excludeTitleWords.some((w) => lower.startsWith(w) || lower === w);
      if ((hasEmoji || (startsWithCaps && notNumbered)) && notExcluded && !line.includes(':')) {
        title = line.replace(/^[\s\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}]*/u, '').trim() || line;
        foundTitle = true;
        continue;
      }
    }

    // Раздел "Ингредиенты" / "Список продуктов" — поддерживаем эмодзи и markdown (🥘 **Ингредиенты:**)
    const lineClean = line.replace(/\*\*/g, "").replace(/^[\s\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}]*/u, "").trim().toLowerCase();
    if (/^(ингредиенты|ингредиент|список продуктов)[:\s]*$/i.test(lineClean) || /^(ингредиенты|ингредиент|список продуктов)[:\s]*$/i.test(lower)) {
      inIngredientsSection = true;
      inStepsSection = false;
      continue;
    }
    if (/^(приготовление|шаги|способ приготовления)[:\s]*$/i.test(lineClean) || /^(приготовление|шаги|способ приготовления)[:\s]*$/i.test(lower)) {
      inStepsSection = true;
      inIngredientsSection = false;
      continue;
    }

    // Строки вида "1. ..." или "- ..." / "• ..."
    const numberedMatch = line.match(/^\d+[\.\)]\s*(.+)$/);
    const bulletMatch = line.match(/^[-•*]\s*(.+)$/);
    const content = (numberedMatch?.[1] ?? bulletMatch?.[1] ?? '').trim();
    if (content.length === 0) continue;

    const isInstructionLine = isInstruction(content);
    const hasAction = containsActionVerb(content);
    const startsWithCommand = startsWithActionVerb(content);
    const hasVerbInFirstHalf = hasActionVerbInFirstHalf(content);
    const isInstructionPhrase = looksLikeInstructionPhrase(content);
    const isPrepositionPurpose = isIngredientWithPrepositionPurpose(content);

    // Глагол-команда в начале или в первой половине — строго steps (например "Отожми лишний сок", "Подавай, посыпав...")
    if (startsWithCommand || hasVerbInFirstHalf || hasAction) {
      // Исключение: "Масло — для жарки" — тире/двоеточие и только назначение (для жарки, по вкусу) → ингредиент
      if (isPrepositionPurpose && content.length <= 40) {
        const trimmed = content.trim().slice(0, 40);
        if (trimmed) ingredients.push(trimmed);
      } else {
        steps.push(content);
      }
      continue;
    }

    if (numberedMatch || bulletMatch) {
      // Лимит 40 символов для ингредиента; длиннее — автоматически шаг
      if (inStepsSection || isInstructionLine || isInstructionPhrase || content.length > 40) {
        steps.push(content);
      } else if (
        inIngredientsSection ||
        (!inStepsSection && content.length <= 40 && (content.includes('—') || content.includes(':')))
      ) {
        const trimmed = content.trim().slice(0, 40);
        if (trimmed) ingredients.push(trimmed);
      } else if (!inStepsSection && content.length <= 40 && !isInstructionPhrase) {
        const trimmed = content.trim().slice(0, 40);
        if (trimmed) ingredients.push(trimmed);
      }
      continue;
    }
  }

  if (!title && lines[0]) {
    const first = lines[0];
    if (first.length >= 2 && first.length <= 80 && !/^\d+[\.\)]/.test(first)) {
      title = first.replace(/^[\s\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}]*/u, '').trim() || first;
    }
  }
  if (!title) title = 'Рецепт из чата';
  if (title.length < 2) return null;

  // Очистка: убрать из списка покупок строки-инструкции (начинаются с большой буквы + глагол действия, например "Подавай, посыпав...")
  const cleanedIngredients = ingredients.filter(
    (item) => !(/^[А-ЯЁA-Z]/.test(item) && containsActionVerb(item))
  );

  if (cleanedIngredients.length === 0 && steps.length === 0 && title === 'Рецепт из чата') {
    return null;
  }

  return {
    title: title.slice(0, 200),
    ingredients: cleanedIngredients,
    steps,
    mealType: detectMealType(text),
  };
}

/**
 * Парсит рецепт из форматированного текста (🍽️ **Title**, 🥘 **Ингредиенты:**, 👨‍🍳 **Приготовление:**).
 * Для сообщений из истории, сохранённых до перехода на строгий JSON.
 */
function parseRecipeFromFormattedText(text: string): ParsedRecipe | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const titleMatch = trimmed.match(/(?:🍽️\s*)?\*\*([^*]+)\*\*/);
  const title = titleMatch ? titleMatch[1].trim() : null;
  if (!title) return null;

  const timeMatch = trimmed.match(/⏱️\s*Время приготовления:\s*(\d+)\s*мин/);
  const cookingTime = timeMatch ? parseInt(timeMatch[1], 10) : undefined;

  const ingredients: string[] = [];
  const ingsSection = trimmed.match(/(?:🥘\s*)?\*\*Ингредиенты:\*\*\s*\n([\s\S]*?)(?=(?:👨‍🍳\s*)?\*\*Приготовление:\*\*|$)/i);
  if (ingsSection?.[1]) {
    ingsSection[1]
      .trim()
      .split(/\n/)
      .forEach((line) => {
        const cleaned = line
          .replace(/^\d+\.\s*/, "")
          .replace(/^[\s\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}]*/u, "")
          .trim();
        if (cleaned) ingredients.push(cleaned);
      });
  }

  const steps: string[] = [];
  // Шаги до блока "Совет от шефа" или "Мини-совет" (если есть)
  const stepsSection = trimmed.match(/(?:👨‍🍳\s*)?\*\*Приготовление:\*\*\s*\n([\s\S]*?)(?=\n\n(?:👨‍🍳\s*)?\*\*Совет от шефа:|\n\n\*\*Мини-совет:|$)/i) ?? trimmed.match(/(?:👨‍🍳\s*)?\*\*Приготовление:\*\*\s*\n([\s\S]*)$/i);
  if (stepsSection?.[1]) {
    stepsSection[1]
      .trim()
      .split(/\n/)
      .forEach((line) => {
        const cleaned = line.replace(/^\d+\.\s*/, "").trim();
        if (cleaned && !cleaned.includes("Совет от шефа") && !cleaned.includes("Мини-совет")) steps.push(cleaned);
      });
  }

  // Совет от шефа (формат: 👨‍🍳 **Совет от шефа:** текст)
  const chefAdviceMatch = trimmed.match(/\*\*Совет от шефа:\*\*\s*\n([\s\S]*?)(?=\n\n|\*\*Мини-совет|\*\*Приготовление|$)/i);
  const chefAdvice = chefAdviceMatch?.[1]?.trim();
  const adviceMatch = trimmed.match(/\*\*Мини-совет:\*\*\s*\n([\s\S]*?)(?=\n\n|$)/i);
  const advice = adviceMatch?.[1]?.trim();

  return {
    title,
    ingredients: ingredients.length ? ingredients : [],
    steps: steps.length ? steps : [],
    cookingTime,
    ...(chefAdvice && { chefAdvice }),
    ...(advice && { advice }),
  };
}

/**
 * Определяет тип приема пищи из текста запроса или ответа
 */
export function detectMealType(text: string): 'breakfast' | 'lunch' | 'snack' | 'dinner' | undefined {
  if (!text) return undefined;

  const lowerText = text.toLowerCase();

  // Завтрак - приоритетные ключевые слова
  if (
    lowerText.includes('завтрак') ||
    lowerText.includes('breakfast') ||
    lowerText.includes('утром') ||
    lowerText.includes('утренний') ||
    lowerText.includes('на завтрак') ||
    lowerText.includes('для завтрака')
  ) {
    return 'breakfast';
  }

  // Обед
  if (
    lowerText.includes('обед') ||
    lowerText.includes('lunch') ||
    lowerText.includes('в обед') ||
    lowerText.includes('обеденный') ||
    lowerText.includes('на обед') ||
    lowerText.includes('для обеда')
  ) {
    return 'lunch';
  }

  // Полдник
  if (
    lowerText.includes('полдник') ||
    lowerText.includes('snack') ||
    lowerText.includes('перекус') ||
    lowerText.includes('на полдник') ||
    lowerText.includes('для полдника')
  ) {
    return 'snack';
  }

  // Ужин
  if (
    lowerText.includes('ужин') ||
    lowerText.includes('dinner') ||
    lowerText.includes('вечером') ||
    lowerText.includes('вечерний') ||
    lowerText.includes('на ужин') ||
    lowerText.includes('для ужина')
  ) {
    return 'dinner';
  }

  return undefined;
}

/**
 * Извлекает первый полный JSON-объект с начала строки (по балансу скобок).
 */
export function extractFirstJsonObjectFromStart(str: string): string | null {
  const trimmed = str.trim();
  if (!trimmed.startsWith('{')) return null;
  return extractJsonObjectAt(trimmed, 0);
}

/**
 * Находит первый символ '{' в строке и извлекает один полный JSON-объект по балансу скобок.
 * Позволяет игнорировать любой текст до или после JSON-блока (например, вводный текст от ИИ).
 */
export function extractSingleJsonObject(str: string): string | null {
  const firstBrace = str.indexOf('{');
  if (firstBrace === -1) return null;
  return extractJsonObjectAt(str, firstBrace);
}

/**
 * Извлекает один полный JSON-объект начиная с позиции startIndex (по балансу скобок).
 * Игнорирует текст до и после JSON. Возвращает подстроку с объектом или null.
 */
export function extractJsonObjectAt(str: string, startIndex: number): string | null {
  const i = str.indexOf('{', startIndex);
  if (i === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  let quote = '';
  for (let j = i; j < str.length; j++) {
    const c = str[j];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (c === '\\') escape = true;
      else if (c === quote) inString = false;
      continue;
    }
    if (c === '"' || c === "'") {
      inString = true;
      quote = c;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return str.slice(i, j + 1);
    }
  }
  return null;
}

/** Результат парсинга ответа ИИ: рецепты для БД и текст для отображения в чате. */
export interface ParseRecipesFromChatResult {
  recipes: ParsedRecipe[];
  /** Текст для отображения в чате: оформленный рецепт без сырого JSON или текст после JSON. */
  displayText: string;
}

/** Формирует ParseRecipesFromChatResult из массива рецептов, возвращённых API (когда бэкенд отдал recipes[]). */
export function parseRecipesFromApiResponse(
  apiRecipes: Array<Record<string, unknown>>,
  fallbackDisplayText = "Вот рецепт"
): ParseRecipesFromChatResult {
  const recipes: ParsedRecipe[] = apiRecipes.map((r) => {
    const title = (r.title as string) || (r.name as string) || "Рецепт";
    const rawIngredients = Array.isArray(r.ingredients) ? r.ingredients : [];
    const ingredients: ParsedIngredient[] = rawIngredients.map((item: unknown) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && "name" in item) {
        const o = item as { name: string; displayText?: string; amount?: string; canonical?: { amount?: number; unit?: string } | null; substitute?: string };
        return {
          name: o.name,
          display_text: o.displayText ?? o.amount,
          amount: o.amount,
          substitute: o.substitute,
          canonical_amount: o.canonical?.amount ?? null,
          canonical_unit: o.canonical?.unit === "g" || o.canonical?.unit === "ml" ? o.canonical.unit : undefined,
        };
      }
      return String(item);
    });
    const steps = Array.isArray(r.steps) ? (r.steps as string[]).map((s) => String(s ?? "").trim()).filter(Boolean) : [];
    const nutritionFields = extractNutritionFields(r as Record<string, unknown>);
    const goals = extractNutritionGoals(r as Record<string, unknown>);
    const minAgeMonths = asFiniteNumberField((r as Record<string, unknown>).min_age_months ?? (r as Record<string, unknown>).minAgeMonths);
    const maxAgeMonths = asFiniteNumberField((r as Record<string, unknown>).max_age_months ?? (r as Record<string, unknown>).maxAgeMonths);
    const servingsRaw =
      asFiniteNumberField((r as Record<string, unknown>).servings) ??
      asFiniteNumberField((r as Record<string, unknown>).servings_base) ??
      asFiniteNumberField((r as Record<string, unknown>).servingsCount);
    const servings =
      servingsRaw != null && servingsRaw >= 1 && servingsRaw <= 99 ? Math.round(servingsRaw) : null;
    return {
      title: String(title).trim(),
      description: typeof r.description === "string" ? r.description : undefined,
      ingredients,
      steps,
      cookingTime: typeof r.cookingTimeMinutes === "number" ? r.cookingTimeMinutes : (r.cookingTime as number) ?? (r.cooking_time as number),
      mealType: r.mealType as ParsedRecipe["mealType"],
      chefAdvice: extractChefAdvice(r as Record<string, unknown>),
      advice: typeof r.advice === "string" ? r.advice : undefined,
      ...(minAgeMonths != null || maxAgeMonths != null
        ? { min_age_months: minAgeMonths ?? null, max_age_months: maxAgeMonths ?? null }
        : {}),
      ...nutritionFields,
      ...(goals?.length ? { nutrition_goals: goals } : {}),
      ...(servings != null ? { servings } : {}),
    };
  });
  const displayText = recipes.length > 0 ? formatRecipeForDisplay(recipes[0]) : fallbackDisplayText;
  return { recipes, displayText };
}

/** Форматирует рецепт для отображения в чате (без сырого JSON): название, описание, ингредиенты, шаги. */
function formatRecipeForDisplay(recipe: ParsedRecipe): string {
  const lines: string[] = [];
  lines.push(`🍽️ **${recipe.title}**`);
  if (recipe.description?.trim()) {
    lines.push('');
    lines.push(recipe.description.trim());
  }
  if (recipe.cookingTime != null && recipe.cookingTime > 0) {
    lines.push('');
    lines.push(`⏱️ ${recipe.cookingTime} мин`);
  }
  const kcal = recipe.calories;
  const hasMacros =
    recipe.proteins != null || recipe.fats != null || recipe.carbs != null;
  if (kcal != null || hasMacros) {
    lines.push('');
    if (kcal != null) {
      lines.push(`🔥 **${Math.round(kcal)} ккал** на порцию`);
    }
    if (hasMacros) {
      const p = recipe.proteins;
      const f = recipe.fats;
      const c = recipe.carbs;
      const parts: string[] = [];
      if (p != null) parts.push(`белки ${Math.round(p)} г`);
      if (f != null) parts.push(`жиры ${Math.round(f)} г`);
      if (c != null) parts.push(`углеводы ${Math.round(c)} г`);
      if (parts.length) {
        lines.push(`В одной порции: ${parts.join(" · ")}`);
      }
    }
  }
  if (recipe.ingredients?.length) {
    lines.push('');
    lines.push('🥘 **Ингредиенты:**');
    recipe.ingredients.forEach((ing) => lines.push(`- ${ingredientDisplayText(ing)}`));
  }
  if (recipe.steps?.length) {
    lines.push('');
    lines.push('👨‍🍳 **Приготовление:**');
    recipe.steps.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
  }
  if (recipe.chefAdvice?.trim()) {
    const isInfant = isInfantRecipe(recipe);
    const title = getAdviceSectionTitle({ recipe, kind: "chef" });
    lines.push('');
    lines.push(`${isInfant ? "👩‍🍳" : "👨‍🍳"} **${title}:**`);
    lines.push(recipe.chefAdvice.trim());
  } else if (recipe.advice?.trim()) {
    const isInfant = isInfantRecipe(recipe);
    const title = getAdviceSectionTitle({ recipe, kind: "mini" });
    lines.push('');
    lines.push(`${isInfant ? "👩‍🍳" : "💡"} **${title}:**`);
    lines.push(recipe.advice.trim());
  }
  return lines.join('\n');
}

/** Убирает ведущий JSON (или блок \`\`\`json ... \`\`\`) из ответа ИИ и возвращает оставшийся текст. */
function getTextAfterJson(text: string): string {
  let t = text.trim();
  t = t.replace(/^```(?:json)?\s*\n[\s\S]*?```\s*/i, '').trim();
  if (t.startsWith('{')) {
    const jsonStr = extractJsonObjectAt(t, 0);
    if (jsonStr) {
      const idx = t.indexOf(jsonStr);
      t = t.slice(idx + jsonStr.length).trim();
    }
  }
  return t;
}

/** Возвращает текст после блока JSON, полностью убирая сырой JSON, блоки кода и дубли рецепта. Оставляет ТОЛЬКО бонусные блоки: «Секрет», «Польза», «Семейная подача». */
function getTextAfterJsonBlock(aiResponse: string, jsonEndIndex: number): string {
  if (jsonEndIndex <= 0 || jsonEndIndex >= aiResponse.length) return '';
  let t = aiResponse.slice(jsonEndIndex).trim();

  // Убираем остатки code block
  t = t.replace(/^\s*```\s*(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/m, '').trim();

  // Убираем JSON-объекты в начале
  if (t.startsWith('{')) {
    const jsonStr = extractJsonObjectAt(t, 0);
    if (jsonStr) t = t.slice(jsonStr.length).trim();
  }

  // Фильтруем: оставляем только бонусные блоки (строки с emoji или ключевыми словами)
  const bonusMarkers = ['👨‍👩‍👧‍👦', '✨', '💡', '💪', 'Семейная подача', 'Польза для развития', 'Секрет', 'КБЖУ', 'Маленький секрет', 'Секрет шефа'];
  const lines = t.split('\n');
  const bonusLines: string[] = [];
  let inBonusBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();
    // Пропускаем пустые строки между бонусами
    if (!trimmed) {
      if (inBonusBlock) bonusLines.push('');
      continue;
    }
    // Проверяем, начинается ли строка с бонусного маркера
    const isBonus = bonusMarkers.some(m => trimmed.includes(m));
    if (isBonus) {
      inBonusBlock = true;
      bonusLines.push(trimmed);
    } else if (inBonusBlock && !trimmed.startsWith('🍽️') && !trimmed.startsWith('🥘') && !trimmed.startsWith('👨‍🍳') && !trimmed.startsWith('⏱️')) {
      // Продолжаем бонусный блок, если это не дубль рецепта
      bonusLines.push(trimmed);
    } else {
      // Это дубль рецепта (🍽️, 🥘, 👨‍🍳, ⏱️) — пропускаем и сбрасываем флаг
      inBonusBlock = false;
    }
  }

  return bonusLines.join('\n').trim();
}

/** Маркеры «человеческого» ответа — при их наличии не запускаем parseRecipeFromPlainText. */
const HUMAN_TEXT_MARKERS = [
  'Почему это удобно',
  'Почему удобно',
  'Маленький бонус',
  'Параметры',
  'Приготовление',
  'Ингредиенты',
  'разбор',
  'Мама',
  'Папа',
  'Ребенок',
  'Для каждого',
  'Совет от шефа',
  /** Ответы Edge без JSON: curated 0–11 мес / старые блоки / подсказки */
  'Не удалось подобрать подходящее простое блюдо',
  'схеме прикорма',
  'подбирать рецепты ещё рано',
  'Сейчас подбирать рецепты ещё рано',
  'не генерируем рецепты автоматически',
  'не создаём рецепты автоматически',
];

function looksLikeHumanText(text: string): boolean {
  if (!text) return false;
  const t = text.trim();
  if (HUMAN_TEXT_MARKERS.some((m) => t.includes(m))) return true;
  if (t.length < 150) return false;
  return t.split(/\n/).length >= 4 && t.length > 300;
}

/**
 * Парсит рецепты из ответа AI. Находит JSON через регулярное выражение / извлечение по балансу скобок,
 * парсит его и сохраняет данные рецепта для БД.
 * Главное: возвращает оригинальный aiResponse полностью (displayText = aiResponse) для отображения в чате.
 * Не фильтрует и не удаляет блоки «Почему это удобно», «Описание» и т.д.
 */
export function parseRecipesFromChat(
  userMessage: string,
  aiResponse: string
): ParseRecipesFromChatResult {

  const recipes: ParsedRecipe[] = [];
  const mealType = detectMealType(userMessage) || detectMealType(aiResponse);

  let jsonString: string | null = null;
  let jsonStartIndex = -1;
  let jsonEndIndex = -1;

  // 1. JSON внутри ```json ... ``` — надёжно вырезает даже при тексте до/после
  if (!jsonString) {
    const codeBlockMatch = aiResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch?.[1]) {
      const blockContent = codeBlockMatch[1].trim();
      if (blockContent.startsWith('{')) {
        const extracted = extractJsonObjectAt(blockContent, 0);
        if (extracted) {
          jsonString = extracted;
          jsonStartIndex = aiResponse.indexOf(codeBlockMatch[0]);
          jsonEndIndex = jsonStartIndex + codeBlockMatch[0].length;
        }
      }
    }
  }
  // 2. RegExp: JSON-рецепт (title, name, description, ingredients, steps, cookingTime)
  if (!jsonString) {
    const recipeJsonRe = /\{\s*"(?:title|name|description|ingredients|steps|cookingTime|cooking_time)"\s*:/;
    const m = aiResponse.match(recipeJsonRe);
    if (m && m.index != null) {
      const extracted = extractJsonObjectAt(aiResponse, m.index);
      if (extracted) {
        jsonString = extracted;
        jsonStartIndex = m.index;
        jsonEndIndex = jsonStartIndex + extracted.length;
      }
    }
  }
  // 3. Извлечение по первой '{' и балансу скобок (игнорирует текст до/после JSON)
  if (!jsonString) {
    const extracted = extractSingleJsonObject(aiResponse);
    if (extracted) {
      jsonString = extracted;
      jsonStartIndex = aiResponse.indexOf(extracted);
      jsonEndIndex = jsonStartIndex + extracted.length;
    }
  }
  // 4. JSON в начале строки
  if (!jsonString && aiResponse.trim().startsWith('{')) {
    const extracted = extractFirstJsonObjectFromStart(aiResponse);
    if (extracted) {
      jsonString = extracted;
      jsonStartIndex = aiResponse.indexOf(extracted);
      jsonEndIndex = jsonStartIndex + extracted.length;
    }
  }
  // 5. Любой { в строке (fallback)
  if (!jsonString) {
    const firstBrace = aiResponse.indexOf('{');
    if (firstBrace !== -1) {
      const extracted = extractJsonObjectAt(aiResponse, firstBrace);
      if (extracted) {
        jsonString = extracted;
        jsonStartIndex = firstBrace;
        jsonEndIndex = firstBrace + extracted.length;
      }
    }
  }

  let jsonParsedSuccessfully = false;
  if (jsonString) {
    try {
      const parsed = JSON.parse(jsonString);

      if (parsed.title || parsed.name) {
        const title = parsed.title || parsed.name;
        if (title && title.trim() && title !== 'Рецепт из чата' && title.length >= 3 && title.length <= 80) {
          const rawIngredients = Array.isArray(parsed.ingredients)
            ? parsed.ingredients
            : parsed.ingredients?.split(',').map((i: string) => i.trim()) || [];
          const ingredients: ParsedIngredient[] = rawIngredients.map((item: unknown) => {
            if (typeof item === 'string') return item;
            if (item && typeof item === 'object' && 'name' in item && typeof (item as { name: string }).name === 'string') {
              const o = item as { name: string; displayText?: string; amount?: string; canonical?: { amount: number; unit: string } | null; substitute?: string };
              return {
                name: o.name,
                display_text: o.displayText ?? o.amount,
                amount: o.amount,
                substitute: o.substitute,
                canonical_amount: o.canonical?.amount,
                canonical_unit: o.canonical?.unit === 'g' || o.canonical?.unit === 'ml' ? o.canonical.unit : undefined,
              };
            }
            return String(item);
          });
          const steps = Array.isArray(parsed.steps)
            ? parsed.steps
            : parsed.steps?.split('\n').filter((s: string) => s.trim()) || [];
          if (ingredients.length > 0 || steps.length > 0) {
            const nutritionFields = extractNutritionFields(parsed as Record<string, unknown>);
            const goals = extractNutritionGoals(parsed as Record<string, unknown>);
            recipes.push({
              title: title.trim(),
              description: parsed.description || parsed.desc,
              ingredients,
              steps,
              cookingTime: parsed.cookingTimeMinutes ?? parsed.cookingTime ?? parsed.cooking_time ?? parsed.time,
              mealType,
              chefAdvice: extractChefAdvice(parsed as Record<string, unknown>),
              advice: typeof parsed.advice === 'string' ? parsed.advice : undefined,
              ...nutritionFields,
              ...(goals?.length ? { nutrition_goals: goals } : {}),
            });
          }
        }
      }

      // Если модель вернула массив рецептов — берём только первый, остальные игнорируем
      if (recipes.length === 0 && (Array.isArray(parsed) || Array.isArray(parsed.recipes))) {
        const recipeList = Array.isArray(parsed) ? parsed : parsed.recipes;
        const recipe = recipeList[0];
        if (recipe && (recipe.title || recipe.name)) {
          const title = recipe.title || recipe.name;
          if (title && title.trim() && title !== 'Рецепт из чата' && title.length >= 3 && title.length <= 80) {
            const rawIng = Array.isArray(recipe.ingredients) ? recipe.ingredients : recipe.ingredients?.split(',').map((i: string) => i.trim()) || [];
            const ingredients: ParsedIngredient[] = rawIng.map((item: unknown) => {
              if (typeof item === 'string') return item;
              if (item && typeof item === 'object' && 'name' in item && typeof (item as { name: string }).name === 'string') {
                const o = item as { name: string; displayText?: string; amount?: string; canonical?: { amount: number; unit: string } | null; substitute?: string };
                return {
                  name: o.name,
                  display_text: o.displayText ?? o.amount,
                  amount: o.amount,
                  substitute: o.substitute,
                  canonical_amount: o.canonical?.amount,
                  canonical_unit: o.canonical?.unit === 'g' || o.canonical?.unit === 'ml' ? o.canonical.unit : undefined,
                };
              }
              return String(item);
            });
            const steps = Array.isArray(recipe.steps)
              ? recipe.steps
              : recipe.steps?.split('\n').filter((s: string) => s.trim()) || [];
            if (ingredients.length > 0 || steps.length > 0) {
              const nutritionFields = extractNutritionFields(recipe as Record<string, unknown>);
              const goals = extractNutritionGoals(recipe as Record<string, unknown>);
              recipes.push({
                title: title.trim(),
                description: recipe.description || recipe.desc,
                ingredients,
                steps,
                cookingTime: recipe.cookingTimeMinutes ?? recipe.cookingTime ?? recipe.cooking_time ?? recipe.time,
                mealType: recipe.mealType || mealType,
                chefAdvice: extractChefAdvice(recipe as Record<string, unknown>),
                advice: typeof recipe.advice === 'string' ? recipe.advice : undefined,
                ...nutritionFields,
                ...(goals?.length ? { nutrition_goals: goals } : {}),
              });
            }
          }
        }
      }
      jsonParsedSuccessfully = true;
    } catch (e) {
      safeWarn('Failed to parse JSON recipe:', e);
    }
  }

  // Приоритет JSON: при успешном JSON и непустом списке рецептов пропускаем fallback-парсинг
  if (jsonParsedSuccessfully && recipes.length > 0) {
    // ok
  } else if (recipes.length === 0 && !looksLikeHumanText(aiResponse)) {
    // Сначала пробуем формат 🍽️ **Title**, 🥘 **Ингредиенты:** (старая история)
    const formattedRecipe = parseRecipeFromFormattedText(aiResponse);
    if (formattedRecipe) {
      formattedRecipe.id = formattedRecipe.id ?? generateTempRecipeId();
      recipes.push(formattedRecipe);
      safeLog('parseRecipesFromChat - Parsed recipe from formatted text:', formattedRecipe.title);
    } else {
      const textRecipe = parseRecipeFromPlainText(aiResponse);
      if (textRecipe) {
        textRecipe.id = textRecipe.id ?? generateTempRecipeId();
        recipes.push(textRecipe);
        safeLog('parseRecipesFromChat - Parsed recipe from plain text:', textRecipe.title);
      }
    }
  }

  recipes.forEach((r) => {
    if (!r.id) r.id = generateTempRecipeId();
  });

  // Старый код текстового парсинга - отключен для надежности
  if (false && recipes.length === 0) {
    // Ищем названия рецептов в тексте
    // Паттерны для поиска названий рецептов:
    // 1. Заголовки с цифрами: "1. Название рецепта"
    // 2. Заголовки с маркерами: "- Название рецепта", "• Название рецепта"
    // 3. Заголовки после слов: "Вариант 1:", "Рецепт:", "Блюдо:"
    // 4. Заголовки в кавычках: "Название рецепта"
    // 5. Заголовки с подчеркиванием или жирным: **Название**, __Название__

    const recipeTitlePatterns = [
      // Паттерн 1: Нумерованные списки "1. Название" или "1) Название"
      /(?:^|\n)\s*(\d+)[\.\)]\s*([А-ЯЁ][А-Яа-яё\s]{2,60}?)(?:\n|:|\.|$)/g,
      // Паттерн 2: Маркеры "- Название" или "• Название"
      /(?:^|\n)\s*[-•*]\s*([А-ЯЁ][А-Яа-яё\s]{2,60}?)(?:\n|:|\.|$)/g,
      // Паттерн 3: После слов "Вариант", "Рецепт", "Блюдо"
      /(?:вариант|рецепт|блюдо)\s*\d*\s*[:\-]\s*([А-ЯЁ][А-Яа-яё\s]{2,60}?)(?:\n|:|\.|$)/gi,
      // Паттерн 4: В кавычках
      /["«]([А-ЯЁ][А-Яа-яё\s]{2,60}?)["»]/g,
      // Паттерн 5: Жирный текст **Название** или __Название__
      /\*\*([А-ЯЁ][А-Яа-яё\s]{2,60}?)\*\*/g,
      /__([А-ЯЁ][А-Яа-яё\s]{2,60}?)__/g,
      // Паттерн 6: Заголовки с ### или ##
      /(?:^|\n)\s*#{1,3}\s*([А-ЯЁ][А-Яа-яё\s]{2,60}?)(?:\n|$)/g,
    ];

    const foundTitles = new Set<string>();

    safeLog('parseRecipesFromChat - Starting text parsing with', recipeTitlePatterns.length, 'patterns');

    for (const pattern of recipeTitlePatterns) {
      const matches = [...aiResponse.matchAll(pattern)];
      safeLog('parseRecipesFromChat - Pattern matches:', matches.length);

      matches.forEach((match, index) => {
        // Берем название из группы захвата (обычно вторая группа)
        const title = (match[2] || match[1] || '').trim();

        safeLog(`parseRecipesFromChat - Match ${index}:`, { title, match: match[0] });

        // Проверяем, что это похоже на название рецепта
        if (title.length >= 3 && title.length <= 80) {
          const lowerTitle = title.toLowerCase();

          // Исключаем общие слова и фразы
          const excludeWords = [
            'ингредиент', 'ингредиенты', 'приготовление', 'шаг', 'шаги', 'способ',
            'рецепт', 'вариант', 'блюдо', 'для', 'способ приготовления',
            'мякоть', 'размять', 'вилкой', 'нарезать', 'варить', 'жарить',
            'яркое', 'нравится', 'детям', 'полезно', 'вкусно'
          ];

          // Исключаем если начинается с исключаемых слов
          const isExcluded = excludeWords.some(word =>
            lowerTitle.startsWith(word) ||
            lowerTitle.includes(` ${word} `) ||
            lowerTitle.endsWith(` ${word}`)
          );

          // Исключаем описания (содержат слова-описания)
          const descriptionWords = [
            'яркое', 'нравится', 'полезно', 'вкусно', 'легко', 'просто',
            'быстро', 'полезный', 'вкусный', 'питательный'
          ];
          const isDescription = descriptionWords.some(word => lowerTitle.includes(word));

          // Исключаем инструкции (содержат глаголы действия)
          const actionVerbs = [
            'размять', 'нарезать', 'варить', 'жарить', 'тушить', 'готовить',
            'добавить', 'смешать', 'залить', 'положить', 'взять', 'нагреть'
          ];
          const isInstruction = actionVerbs.some(verb => lowerTitle.includes(verb));

          // Исключаем слишком длинные фразы, которые похожи на описания
          const isTooLong = title.length > 50 && title.split(' ').length > 6;

          // Исключаем фразы с запятыми (обычно это описания)
          const hasCommas = title.includes(',');

          if (!isExcluded && !isDescription && !isInstruction && !isTooLong && !hasCommas && !foundTitles.has(title)) {
            foundTitles.add(title);

            // Определяем тип приема пищи для этого конкретного рецепта
            // Ищем контекст вокруг названия
            const titleIndex = aiResponse.indexOf(title);
            const contextStart = Math.max(0, titleIndex - 150);
            const contextEnd = Math.min(aiResponse.length, titleIndex + title.length + 150);
            const context = aiResponse.substring(contextStart, contextEnd);

            // Определяем тип приема пищи из контекста
            const contextMealType = detectMealType(context) || mealType;

            safeLog('parseRecipesFromChat - Found recipe:', { title, contextMealType, context: context.substring(0, 50) });

            recipes.push({
              title: title,
              description: `Рецепт предложен AI ассистентом`,
              ingredients: [],
              steps: [],
              mealType: contextMealType,
            });
          } else {
            safeLog('parseRecipesFromChat - Excluded title:', title, { isExcluded, alreadyFound: foundTitles.has(title) });
          }
        }
      });

      // Если нашли рецепты, продолжаем поиск для других паттернов (может быть несколько рецептов)
      // Не break, чтобы найти все возможные рецепты
    }

    safeLog('parseRecipesFromChat - Found', recipes.length, 'recipes from text parsing');
  }

  // Отключаем fallback парсинг - он создает некорректные рецепты
  // Сохраняем только структурированные рецепты из JSON
  if (false && recipes.length === 0 && (
    aiResponse.includes('рецепт') ||
    aiResponse.includes('ингредиент') ||
    aiResponse.includes('приготовить') ||
    aiResponse.includes('блюдо') ||
    aiResponse.includes('вариант')
  )) {
    // Пытаемся извлечь название рецепта из ответа
    // Ищем первое значимое название после слов "рецепт", "блюдо", "вариант"
    const titlePatterns = [
      // Более строгий паттерн: после "рецепт:" или "блюдо:" должно быть короткое название
      /(?:рецепт|блюдо|вариант)[:\s]+([А-ЯЁ][А-Яа-яё]{2,20}?)(?:\s|:|\.|$|\n)/i,
      // Название в кавычках
      /["«]([А-ЯЁ][А-Яа-яё\s]{2,30}?)["»]/,
      // Название после заголовка
      /(?:^|\n)\s*([А-ЯЁ][А-Яа-яё]{2,25}?)(?:\s|:|\.|$|\n)/,
    ];

    let title = 'Рецепт из чата';
    const excludeWords = [
      'ингредиент', 'приготовление', 'шаг', 'способ', 'рецепт', 'вариант',
      'блюдо', 'мякоть', 'размять', 'яркое', 'нравится'
    ];

    for (const pattern of titlePatterns) {
      const match = aiResponse.match(pattern);
      if (match && match[1]) {
        const candidate = match[1].trim();
        const lowerCandidate = candidate.toLowerCase();

        // Проверяем, что это не исключаемое слово и не слишком длинное
        const isValid = candidate.length >= 3 &&
          candidate.length <= 40 &&
          !excludeWords.some(word => lowerCandidate.includes(word)) &&
          !lowerCandidate.includes(',') &&
          candidate.split(' ').length <= 5;

        if (isValid) {
          title = candidate;
          break;
        }
      }
    }

    // Извлекаем ингредиенты (строки со списками или маркерами)
    const ingredientLines = aiResponse.split('\n').filter(line => {
      const trimmed = line.trim();
      return trimmed.length > 0 && (
        trimmed.includes('-') ||
        trimmed.includes('•') ||
        trimmed.includes('*') ||
        trimmed.match(/^\d+[\.\)]/) ||
        (trimmed.length < 100 && !trimmed.includes(':'))
      );
    });

    // Извлекаем шаги приготовления
    const stepLines = aiResponse.split('\n').filter(line => {
      const trimmed = line.trim();
      return trimmed.length > 15 && (
        trimmed.includes('приготов') ||
        trimmed.includes('добав') ||
        trimmed.includes('вари') ||
        trimmed.includes('жари') ||
        trimmed.includes('туши') ||
        trimmed.match(/^\d+[\.\)]/)
      );
    });

    recipes.push({
      title: title.length > 100 ? 'Рецепт из чата' : title,
      description: aiResponse.substring(0, 300),
      ingredients: ingredientLines.slice(0, 10).map(line => line.replace(/^[-•*\d\.\)]\s*/, '').trim()),
      steps: stepLines.length > 0
        ? stepLines.slice(0, 10).map(line => line.replace(/^\d+[\.\)]\s*/, '').trim())
        : aiResponse.split('\n').filter(line => line.trim().length > 20).slice(0, 5),
      mealType,
    });
  }

  let displayText: string;
  if (recipes.length > 0) {
    const formattedRecipe = formatRecipeForDisplay(recipes[0]);
    const textAfterJsonBlock =
      jsonString && jsonEndIndex >= 0 ? getTextAfterJsonBlock(aiResponse, jsonEndIndex) : '';
    displayText = textAfterJsonBlock ? `${formattedRecipe}\n\n${textAfterJsonBlock}` : formattedRecipe;
    if (recipes.length > 1) {
      recipes.slice(1).forEach((r) => {
        displayText += '\n\n---\n\n' + formatRecipeForDisplay(r);
      });
    }
  } else {
    const textAfterJson = getTextAfterJson(aiResponse);
    const looksLikeRawJson = aiResponse.trim().startsWith('{');
    displayText =
      textAfterJson.length > 0
        ? textAfterJson
        : looksLikeRawJson
          ? 'Рецепт получен. (Не удалось распознать формат ответа.)'
          : aiResponse;
  }

  return { recipes, displayText };
}
