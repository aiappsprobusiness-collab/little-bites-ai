/**
 * Intent scoring + decision для маршрутизации чата рецептов (без LLM).
 * Считает независимые сигналы (assistant / food / recipe context / offtopic), затем выбирает маршрут с margin logic.
 */
import { detectAssistantTopic } from "./assistantTopicDetect.ts";
import type { AssistantTopicDetectResult } from "./assistantTopicDetect.ts";

const VOWELS = /[аеёиоуыэюяaeiou]/gi;
const MIN_VOWEL_RATIO = 0.12;

export type ChatIntentScores = {
  assistantScore: number;
  foodScore: number;
  recipeContextScore: number;
  offtopicScore: number;
  /** foodScore + recipeContextScore */
  recipePathScore: number;
};

export type RecipeChatIntentResult = {
  route: "recipe" | "irrelevant" | "assistant_topic";
  reason: string;
  scores: ChatIntentScores;
  /** top − second среди трёх корзин assistant / offtopic / recipePath */
  margin: number;
  winner: "assistant" | "offtopic" | "recipe";
  topic?: Extract<AssistantTopicDetectResult, { matched: true }>;
};

/** Порог: явный off-topic (как раньше по NON_FOOD) */
const OFFTOPIC_STRONG_MIN = 4;
/** Порог уверенного assistant при победе корзины assistant */
const ASSISTANT_WIN_MIN = 5;
/** Минимальная маржа между 1-м и 2-м местом для «жёсткого» решения */
const MARGIN_MIN = 2;

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

function normalizeIntentInput(input: string): string {
  return (input ?? "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}

/** Ингредиенты / продукты — вклад в foodScore (+2, с потолком) */
const INGREDIENT_TERMS: string[] = [
  "курица", "мясо", "свинина", "говядина", "индейка", "телятина", "баранина",
  "рыба", "лосось", "треска", "минтай", "селедк", "икра",
  "яйцо", "яйца", "творог", "молоко", "сыр", "кефир", "сметана", "йогурт",
  "овощи", "фрукты", "кабачок", "баклажан", "тыква", "морковь", "свекла", "капуста", "помидор", "огурец", "перец", "лук", "чеснок",
  "картофель", "пюре", "рис", "гречка", "овсянка", "макарон", "лапша", "крупа", "булгур", "киноа",
  "суп", "каша", "омлет", "салат", "соус", "гриб", "грибы", "сливки", "масло",
  "котлет", "тефтел", "голубц", "вареник", "блин", "оладь", "сырник", "запеканк", "шарлотк",
  "борщ", "щи", "рагу", "индейк", "курин",
];

const COOKING_VERBS: string[] = [
  "готовить", "приготовить", "приготовь", "сделать", "свари", "запеки", "запечь", "тушен", "жарен", "паров", "тушить", "жарить",
];

const MEAL_CONTEXT: string[] = ["завтрак", "обед", "ужин", "полдник", "перекус", "меню"];

/** Структурные паттерны «запрос блюда» — recipeContextScore */
const RECIPE_PHRASES: Array<{ s: string; w: number }> = [
  { s: "что приготовить", w: 3 },
  { s: "что покормить", w: 3 },
  { s: "чем покормить", w: 3 },
  { s: "чем кормить", w: 2 },
  { s: "рецепт", w: 2 },
  { s: "рецепты", w: 2 },
  { s: "блюдо из", w: 2 },
  { s: "ужин из", w: 2 },
  { s: "обед из", w: 2 },
  { s: "завтрак из", w: 2 },
  { s: "приготовить из", w: 2 },
  { s: "как приготовить", w: 2 },
  { s: "из чего", w: 1 },
  { s: "идея для", w: 1 },
  { s: "еда", w: 1 },
  { s: "блюдо", w: 1 },
  { s: "ингредиенты", w: 1 },
];

const FOOD_STRUCTURE_PATTERNS: Array<{ s: string; w: number }> = [
  { s: " с ", w: 1 },
  { s: " в соусе", w: 1 },
  { s: " и ", w: 1 },
  { s: " без ", w: 1 },
  { s: " на завтрак", w: 1 },
  { s: " на обед", w: 1 },
  { s: " на ужин", w: 1 },
  { s: " из курицы", w: 2 },
  { s: " из мяса", w: 2 },
  { s: " из рыбы", w: 2 },
  { s: " с курицей", w: 1 },
  { s: " с мясом", w: 1 },
  { s: " с рыбой", w: 1 },
];

/** Off-topic: совпадает с прежним NON_FOOD + расширения */
const OFFTOPIC_MARKERS: string[] = [
  "погод", "курс доллар", "курс валют", "курс евро", "курс рубл", "расписани", "билет", "кинотеатр",
  "какая погода", "сколько стоит доллар", "когда откроется", "расписание поезд", "погоду в ",
  "политик", "выборы", "депутат", "война ", "матч ", "кто выиграл", "криптовалют", "биткоин",
  "почему жизнь", "смысл жизни",
];

/** Assistant: симптомы, отказ от еды, режим, срочность — компактно, без дублирования всего ASSISTANT_TOPICS */
const ASSISTANT_SYMPTOMS: string[] = [
  "сыпь", "рвота", "рвот", "температур", "понос", "запор", "стул малыша", "жидкий стул",
  "зеленый стул", "зелёный стул", "кровь в стуле", "крапивница", "отек ", "отёк ", "зуд ",
  "аллерги", "реакция на", "покраснение", "высыпало", "непереносимость", "срыгива", "колик", "вздутие",
  "зеленый кал", "зелёный кал",
  "пятна на коже", "красные пятна", "на коже", "кожа чешется", "чешется кожа",
  "какается", "какает", "покакал", "диарея", "поносит",
];

const ASSISTANT_REFUSAL: string[] = [
  "не хочет есть", "не ест", "отказ от еды", "отказывается от еды", "отказывается от прикорма",
  "плохо ест", "малоежка", "ничего не ест", "плачет при кормлении", "плачет во время кормления",
];

const ASSISTANT_BABY: string[] = [
  "ребёнок", "ребенок", "малыш", "грудничок", "малыша", "детск", "прикорм",
];

const ASSISTANT_ROUTINE_DIARY: string[] = [
  "режим кормления", "график кормления", "сколько раз кормить", "ночные кормления",
  "дневник питания", "можно ли давать", "как вводить", "первый прикорм", "ввод прикорма",
];

const DISTRESS_MARKERS: string[] = ["плачет", "болит", "срочно к врачу", "вызвать скорую", "высокая температура"];

const MAX_FOOD_FROM_TERMS = 10;
const MAX_ASSISTANT = 14;
const MAX_OFFTOPIC = 12;

/**
 * Сырые скоры по нормализованной строке (lower + ё→е).
 */
export function computeChatIntentScores(trimmed: string, normalizedLower: string): ChatIntentScores {
  const lower = normalizeForMatch(trimmed);
  const n = normalizedLower;

  let food = 0;
  for (const t of INGREDIENT_TERMS) {
    if (lower.includes(t) || n.includes(t)) food += 2;
  }
  food = Math.min(MAX_FOOD_FROM_TERMS, food);

  for (const v of COOKING_VERBS) {
    if (lower.includes(v) || n.includes(v)) food += 2;
  }
  for (const m of MEAL_CONTEXT) {
    if (lower.includes(m) || n.includes(m)) food += 1;
  }
  if ((n.includes("ребёнок") || n.includes("ребенок") || n.includes("малыш") || n.includes("детск")) &&
    (food > 0 || RECIPE_PHRASES.some((p) => n.includes(p.s)))) {
    food += 1;
  }

  let recipeContext = 0;
  for (const { s, w } of RECIPE_PHRASES) {
    if (lower.includes(s) || n.includes(s)) recipeContext += w;
  }
  for (const { s, w } of FOOD_STRUCTURE_PATTERNS) {
    if (lower.includes(s) || n.includes(s)) recipeContext += w;
  }
  recipeContext = Math.min(12, recipeContext);

  let assistant = 0;
  for (const t of ASSISTANT_SYMPTOMS) {
    if (n.includes(t)) assistant += 3;
  }
  for (const t of ASSISTANT_REFUSAL) {
    if (n.includes(t)) assistant += 3;
  }
  for (const t of ASSISTANT_BABY) {
    if (n.includes(t)) assistant += 1;
  }
  for (const t of ASSISTANT_ROUTINE_DIARY) {
    if (n.includes(t)) assistant += 2;
  }
  for (const t of DISTRESS_MARKERS) {
    if (n.includes(t)) assistant += 2;
  }
  assistant = Math.min(MAX_ASSISTANT, assistant);

  let offtopic = 0;
  for (const t of OFFTOPIC_MARKERS) {
    if (lower.includes(t) || n.includes(t)) offtopic += 3;
  }
  offtopic = Math.min(MAX_OFFTOPIC, offtopic);

  const recipePathScore = food + recipeContext;

  return {
    assistantScore: assistant,
    foodScore: food,
    recipeContextScore: recipeContext,
    offtopicScore: offtopic,
    recipePathScore,
  };
}

type Bucket = { name: "assistant" | "offtopic" | "recipe"; score: number };

function rankBuckets(scores: ChatIntentScores): { margin: number; winner: Bucket } {
  const buckets: Bucket[] = [
    { name: "assistant", score: scores.assistantScore },
    { name: "offtopic", score: scores.offtopicScore },
    { name: "recipe", score: scores.recipePathScore },
  ];
  buckets.sort((a, b) => b.score - a.score);
  const winner = buckets[0];
  const secondPlace = buckets[1];
  const margin = winner.score - secondPlace.score;
  return { margin, winner };
}

/**
 * Полный маршрут для чата рецептов: assistant redirect / irrelevant / recipe.
 */
export function resolveRecipeChatIntent(text: string): RecipeChatIntentResult {
  const trimmed = (text ?? "").trim();
  const normalized = normalizeIntentInput(trimmed);
  const lower = normalizeForMatch(trimmed);

  const emptyScores: ChatIntentScores = {
    assistantScore: 0,
    foodScore: 0,
    recipeContextScore: 0,
    offtopicScore: 0,
    recipePathScore: 0,
  };

  if (trimmed.length < 2) {
    return {
      route: "irrelevant",
      reason: "too_short",
      scores: emptyScores,
      margin: 0,
      winner: "offtopic",
    };
  }

  if (!checkVowelRatio(trimmed)) {
    return {
      route: "irrelevant",
      reason: "no_vowels",
      scores: emptyScores,
      margin: 0,
      winner: "offtopic",
    };
  }

  const scores = computeChatIntentScores(trimmed, normalized);
  const { margin, winner } = rankBuckets(scores);

  // Сильный off-topic и явный лидер корзины
  if (
    scores.offtopicScore >= OFFTOPIC_STRONG_MIN &&
    winner.name === "offtopic" &&
    scores.offtopicScore >= scores.recipePathScore &&
    scores.offtopicScore >= scores.assistantScore &&
    margin >= MARGIN_MIN
  ) {
    return {
      route: "irrelevant",
      reason: "offtopic_intent",
      scores,
      margin,
      winner: winner.name,
    };
  }

  // Низкая маржа → прежний fail-open: рецепт
  if (margin < MARGIN_MIN) {
    const topicEarly = detectAssistantTopic(trimmed);
    if (topicEarly.matched && scores.assistantScore >= scores.recipePathScore) {
      return {
        route: "assistant_topic",
        reason: "low_margin_assistant_topic",
        scores,
        margin,
        winner: "assistant",
        topic: topicEarly,
      };
    }
    return {
      route: "recipe",
      reason: "low_margin_fail_open",
      scores,
      margin,
      winner: winner.name,
    };
  }

  // Победа assistant
  if (winner.name === "assistant" && scores.assistantScore >= ASSISTANT_WIN_MIN) {
    const topic = detectAssistantTopic(trimmed);
    if (topic.matched) {
      return {
        route: "assistant_topic",
        reason: "assistant_intent",
        scores,
        margin,
        winner: "assistant",
        topic,
      };
    }
    return {
      route: "recipe",
      reason: "assistant_scores_no_topic_match",
      scores,
      margin,
      winner: "assistant",
    };
  }

  // Off-topic лидирует с достаточным баллом (но ниже OFFTOPIC_STRONG_MIN не сработало выше)
  if (winner.name === "offtopic" && scores.offtopicScore >= OFFTOPIC_STRONG_MIN) {
    return {
      route: "irrelevant",
      reason: "offtopic_winner",
      scores,
      margin,
      winner: "offtopic",
    };
  }

  // Победа recipe path
  if (winner.name === "recipe") {
    return {
      route: "recipe",
      reason: "recipe_intent",
      scores,
      margin,
      winner: "recipe",
    };
  }

  // Победа offtopic при среднем балле — в irrelevant
  if (winner.name === "offtopic") {
    return {
      route: "irrelevant",
      reason: "offtopic_default",
      scores,
      margin,
      winner: "offtopic",
    };
  }

  // Остаток: assistant не набрал тему / слабый assistant
  if (winner.name === "assistant") {
    const topic = detectAssistantTopic(trimmed);
    if (topic.matched && scores.assistantScore > scores.recipePathScore) {
      return {
        route: "assistant_topic",
        reason: "assistant_edge_topic",
        scores,
        margin,
        winner: "assistant",
        topic,
      };
    }
  }

  return {
    route: "recipe",
    reason: "default_fail_open",
    scores,
    margin,
    winner: winner.name,
  };
}
