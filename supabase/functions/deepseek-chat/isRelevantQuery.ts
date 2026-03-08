/**
 * Проверка релевантности запроса для чата рецептов.
 * Принцип: fail-open для food-like, reject только при явно нерелевантном запросе.
 * Никаких уточняющих ответов — только allow (в генерацию) или reject.
 */

const VOWELS = /[аеёиоуыэюяaeiou]/gi;
const MIN_VOWEL_RATIO = 0.12;

export type RelevanceResult = {
  allowed: boolean;
  reason: string;
  matchedTerms: string[];
  matchedPatterns: string[];
  clearlyNonFood: boolean;
};

/** Кулинарные термины: продукты, приёмы пищи, действия, блюда */
const CULINARY_TERMS = [
  "рецепт", "рецепты", "еда", "блюдо", "завтрак", "обед", "ужин", "полдник",
  "готовить", "приготовить", "приготовь", "сделать", "свари", "запеки", "запечь",
  "курица", "мясо", "свинина", "говядина", "индейка", "телятина", "баранина",
  "рыба", "лосось", "треска", "минтай", "селедк", "икра",
  "яйцо", "яйца", "творог", "молоко", "сыр", "кефир", "сметана", "йогурт",
  "овощи", "фрукты", "кабачок", "баклажан", "тыква", "морковь", "свекла", "капуста", "помидор", "огурец", "перец", "лук", "чеснок",
  "картофель", "пюре", "рис", "гречка", "овсянка", "макарон", "лапша", "крупа", "булгур", "киноа",
  "суп", "каша", "омлет", "салат", "соус", "гриб", "грибы", "сливки", "масло",
  "детское", "ребенку", "вкусно", "ингредиенты", "меню", "перекус",
  "покормить", "чем покормить", "чем кормить", "кормить", "кормление", "продукты",
  "котлет", "тефтел", "голубц", "вареник", "блин", "оладь", "сырник", "запеканк", "шарлотк",
  "борщ", "щи", "рагу", "тушен", "жарен", "паров", "на пару", "в духовке",
  "breakfast", "lunch", "dinner", "recipe", "food", "cook",
];

/** Структурные паттерны запроса блюда: X с Y, X в соусе, из X, приём пищи из X */
const FOOD_PATTERNS = [
  " с ", " в соусе", " в соус", " и ", " без ", " на завтрак", " на обед", " на ужин", " на полдник",
  "что приготовить", "приготовить из", "чем покормить", "блюдо из", "ужин из", "обед из", "завтрак из", "рецепт из", "из чего", "как приготовить",
  " из курицы", " из мяса", " из рыбы", " из индейки", " из творога", " из тыквы", " из овощей", " из риса", " из картофел", " из кабачк", " из яиц", " из молока", " из грибов",
  " с курицей", " с мясом", " с рыбой", " с овощами", " с грибами", " с сыром", " с картошкой", " с рисом",
];

/** Явно не про еду — при совпадении и отсутствии food-сигналов отклоняем */
const NON_FOOD_PATTERNS = [
  "погод", "курс доллар", "курс валют", "курс евро", "курс рубл", "расписани", "билет", "кинотеатр",
  "какая погода", "сколько стоит доллар", "когда откроется", "расписание поезд", "погоду в ",
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

function normalizeForMatch(text: string): string {
  return text.replace(/[?!.,;:]+$/g, "").trim().toLowerCase();
}

/**
 * Основная проверка: reject только если явно не про еду; при сомнении — allow.
 * Возвращает структурированный результат для логов.
 */
export function checkFoodRelevance(text: string): RelevanceResult {
  const trimmed = (text ?? "").trim();
  const lower = normalizeForMatch(trimmed);

  if (trimmed.length < 2) {
    return {
      allowed: false,
      reason: "too_short",
      matchedTerms: [],
      matchedPatterns: [],
      clearlyNonFood: false,
    };
  }

  if (!checkVowelRatio(trimmed)) {
    return {
      allowed: false,
      reason: "no_vowels",
      matchedTerms: [],
      matchedPatterns: [],
      clearlyNonFood: false,
    };
  }

  const matchedTerms: string[] = [];
  const matchedPatterns: string[] = [];

  for (const term of CULINARY_TERMS) {
    if (lower.includes(term)) matchedTerms.push(term);
  }
  for (const p of FOOD_PATTERNS) {
    if (lower.includes(p)) matchedPatterns.push(p);
  }

  const hasFoodSignal = matchedTerms.length > 0 || matchedPatterns.length > 0;

  const matchedNonFood: string[] = [];
  for (const p of NON_FOOD_PATTERNS) {
    if (lower.includes(p)) matchedNonFood.push(p);
  }
  const hasNonFoodSignal = matchedNonFood.length > 0;

  if (hasFoodSignal) {
    return {
      allowed: true,
      reason: "food_terms_or_patterns",
      matchedTerms,
      matchedPatterns,
      clearlyNonFood: false,
    };
  }

  if (hasNonFoodSignal) {
    return {
      allowed: false,
      reason: "clearly_non_food",
      matchedTerms: [],
      matchedPatterns: [],
      clearlyNonFood: true,
    };
  }

  return {
    allowed: true,
    reason: "fail_open",
    matchedTerms: [],
    matchedPatterns: [],
    clearlyNonFood: false,
  };
}

/** FREE: совместимость с прежним API — только allow/reject по checkFoodRelevance */
export function isRelevantQuery(text: string): boolean {
  return checkFoodRelevance(text).allowed;
}

/** PREMIUM: то же правило, оба пути (true/"soft") ведут в генерацию — возвращаем только true/false */
export function isRelevantPremiumQuery(text: string): false | "soft" | true {
  const result = checkFoodRelevance(text);
  return result.allowed ? true : false;
}
