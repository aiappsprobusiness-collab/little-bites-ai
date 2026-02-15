/**
 * Проверка релевантности запроса для чата рецептов.
 */

const VOWELS = /[аеёиоуыэюяaeiou]/gi;
const MIN_VOWEL_RATIO = 0.12;

const CULINARY_TERMS = [
  "рецепт", "рецепты", "еда", "блюдо", "завтрак", "обед", "ужин", "полдник",
  "готовить", "приготовить", "приготовь", "сделать", "свари", "курица", "мясо",
  "рыба", "яйцо", "творог", "овощи", "фрукты", "суп", "каша", "омлет", "салат",
  "детское", "ребенку", "вкусно", "ингредиенты", "меню", "перекус",
  "покормить", "чем покормить", "чем кормить", "кормить", "кормление", "продукты",
  "breakfast", "lunch", "dinner", "recipe", "food", "cook"
];

/** Ключевые слова для экспертных вопросов (только для Premium) */
const PREMIUM_EXPERT_TERMS = [
  "польза", "полезно", "витамин", "минерал", "нутриент", "белок", "углевод",
  "заменить", "вместо", "аллергия", "непереносимость", "можно ли", "хранить",
  "заморозить", "срок", "рацион", "диета", "здоровье", "совет", "почему",
  "расскажи", "расскажи про", "что такое", "чем полезен", "чем полезно",
];

/** Явный запрос рецепта — полноценный вызов с генерацией рецепта и JSON */
const RECIPE_REQUEST_TERMS = [
  "рецепт", "рецепты", "приготовь", "приготовить", "что приготовить", "дай рецепт",
  "подскажи рецепт", "блюдо из", "из чего приготовить", "как приготовить", "рецепт из",
  "сделай блюдо", "свари", "запеки", "на завтрак", "на обед", "на ужин", "на полдник",
  "завтрак", "обед", "ужин", "полдник", "перекус",
  "что поесть", "что съесть", "что приготовить из", "придумай рецепт",
  "чем покормить", "чем кормить", "что покормить", "чем накормить",
];

function checkVowelRatio(text: string): boolean {
  const lettersOnly = text.replace(/\s+/g, "").replace(/[^\p{L}]/gu, "");
  if (lettersOnly.length < 2) return false;
  const vowelMatches = lettersOnly.match(VOWELS);
  const vowelCount = vowelMatches ? vowelMatches.length : 0;
  if (vowelCount === 0) return false;
  const vowelRatio = vowelCount / lettersOnly.length;
  return vowelRatio >= MIN_VOWEL_RATIO;
}

/** Нормализует текст для проверки: убирает концевую пунктуацию, чтобы "чем покормить?" и "чем покормить" матчились одинаково. */
function normalizeForMatch(text: string): string {
  return text.replace(/[?!.,;:]+$/g, "").trim().toLowerCase();
}

/** Базовая проверка для FREE: 0 гласных или нет кулинарных слов в короткой фразе — отклоняем. */
export function isRelevantQuery(text: string): boolean {
  const trimmed = (text ?? "").trim();
  if (trimmed.length < 3) return false;
  if (!checkVowelRatio(trimmed)) return false;

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length > 3) return true;

  const lower = normalizeForMatch(trimmed);
  const hasCulinary = CULINARY_TERMS.some(term => lower.includes(term));
  if (!hasCulinary) return false;
  return true;
}

/** Вопросные паттерны — не считать запросом «название блюда». */
const QUESTION_PATTERNS = [
  "как ", "почему ", "что такое", "чем полезен", "чем полезно", "можно ли", "расскажи про", "расскажи о",
];

/**
 * Проверка для PREMIUM: false = бред (0 гласных или нет кулинарных/экспертных слов), 'soft' = мягкий запрос, true = запрос рецепта.
 * Короткая фраза без вопроса (например «хачапури», «хачапури по аджарски») считается запросом конкретного блюда → true.
 */
export function isRelevantPremiumQuery(text: string): false | "soft" | true {
  const trimmed = (text ?? "").trim();
  if (trimmed.length < 2) return false;
  if (!checkVowelRatio(trimmed)) return false;

  const lower = normalizeForMatch(trimmed);
  const words = trimmed.split(/\s+/).filter(Boolean);

  // Короткий запрос без «?» и без вопросительных слов — вероятно название блюда → выдаём рецепт
  if (words.length <= 5 && trimmed.length <= 80 && !trimmed.includes("?")) {
    const looksLikeQuestion = QUESTION_PATTERNS.some((p) => lower.startsWith(p) || lower.includes(" " + p));
    if (!looksLikeQuestion) return true;
  }

  const hasCulinary = CULINARY_TERMS.some(term => lower.includes(term));
  const hasExpert = PREMIUM_EXPERT_TERMS.some(term => lower.includes(term));
  const hasRecipeRequest = RECIPE_REQUEST_TERMS.some(term => lower.includes(term));

  if (!hasCulinary && !hasExpert) return false;

  if (hasRecipeRequest) return true;
  return "soft";
}