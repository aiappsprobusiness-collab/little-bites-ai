/**
 * Stage 2 / 2.1: детерминированный description composer.
 * Короткое описание (текстура, подача, бытовой сценарий). Не дублирует title.
 * Макс. 160 символов, 1–2 предложения. Fallback-only фразы не в основных шаблонах.
 */

export const COMPOSER_DESCRIPTION_MAX_LENGTH = 160;

/** Ингредиенты, которые не считаем «ключевыми» (технические, нейтральные). */
const NEUTRAL_INGREDIENT_PATTERNS = [
  /^вода$/i,
  /^соль$/i,
  /^перец$/i,
  /^масло\s|^масло$/i,
  /^растительное масло$/i,
  /^оливковое масло$/i,
  /^подсолнечное масло$/i,
  /^сливочное масло$/i,
  /^специи?$/i,
  /^лавровый лист$/i,
  /^зелень$/i,
  /^укроп$/i,
  /^петрушка$/i,
  /^сметана$/i,
  /^мука$/i,
  /^крахмал$/i,
  /^сахар$/i,
  /^мёд$/i,
  /^молоко$/i,
  /^бульон$/i,
];

function isNeutralIngredient(name: string): boolean {
  const n = (name ?? "").trim().toLowerCase();
  if (!n || n.length < 2) return true;
  return NEUTRAL_INGREDIENT_PATTERNS.some((re) => re.test(n));
}

export function pickKeyIngredients(ingredients: Array<{ name?: string } | string>): string[] {
  const names: string[] = ingredients
    .map((i) => (typeof i === "string" ? i : (i && typeof i === "object" && "name" in i ? String((i as { name?: string }).name ?? "") : "")))
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && !isNeutralIngredient(s));
  return names.slice(0, 2);
}

export type DishCategory =
  | "soup"
  | "porridge"
  | "pancake"
  | "casserole"
  | "stew"
  | "pasta"
  | "meatballs"
  | "salad"
  | "drink"
  | "default";

export function inferDishCategory(options: {
  title: string;
  mealType?: string | null;
  is_soup?: boolean | null;
  ingredientNames?: string[];
}): DishCategory {
  const text = [
    (options.title ?? "").trim(),
    ...(options.ingredientNames ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (options.is_soup === true || options.mealType === "lunch") {
    if (/\b(суп|бульон|крем-суп|борщ|солянк|окрошк|гаспачо)\b/.test(text)) return "soup";
  }
  if (/\b(суп|бульон|крем-суп|борщ|солянк|окрошк)\b/.test(text)) return "soup";
  if (/\b(каша|овсянк|пшён|рисовая каша|гречневая каша|размазня)\b/.test(text)) return "porridge";
  if (/\b(оладьи|панкейки|сырники|блины|дранники)\b/.test(text)) return "pancake";
  if (/\b(запеканк|запечённ)\b/.test(text)) return "casserole";
  if (/\b(рагу|тушён|тушеное|гуляш)\b/.test(text)) return "stew";
  if (/\b(паста|лапша|макарон|спагетти|вермишель|гарнир)\b/.test(text)) return "pasta";
  if (/\b(котлет|тефтел|фрикадел|биточк)\b/.test(text)) return "meatballs";
  if (/\b(салат|закуска)\b/.test(text)) return "salad";
  if (/\b(смузи|напиток|компот|кисель)\b/.test(text)) return "drink";
  return "default";
}

function simpleHash(str: string): number {
  let h = 0;
  const s = (str ?? "").trim();
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Оси: текстура, подача, домашний характер, лёгкость, семейный сценарий. Разнообразные, ≤160 симв. */
const COMPOSER_TEMPLATES: Record<DishCategory, string[]> = {
  soup: [
    "Нежный по консистенции, удобно подать на обед и разделить на порции.",
    "Мягкая текстура и привычный вкус. Подходит для спокойного семейного обеда.",
    "Удобно разогреть и подать тёплым. Простой состав из привычных продуктов.",
    "Лёгкое по вкусу блюдо без сложных сочетаний. Удобно на общий стол.",
    "Простой домашний вариант. Удобно разделить на порции и подать тёплым.",
    "Нежный по текстуре вариант, который удобно подать на общий стол.",
  ],
  porridge: [
    "Мягкая текстура и понятный состав. Подходит для завтрака или перекуса.",
    "Удобно готовить заранее и разогреть. Простой вариант на каждый день.",
    "Нежный по консистенции, лёгкий по вкусу. Домашний вариант из привычных продуктов.",
    "Удобно подать тёплым. Простой состав без лишних сочетаний.",
    "Подходит для спокойного завтрака. Удобно разделить на порции.",
  ],
  pancake: [
    "Нежная текстура и понятный состав. Подходит для завтрака или перекуса.",
    "Удобно подать на общий стол и разделить на порции. Подавать тёплым.",
    "Простой вариант без лишних сочетаний. Удобно готовить и подавать.",
    "Мягкая текстура, удобно разделить на порции. Домашний вариант.",
  ],
  casserole: [
    "Удобно подать на общий стол и разделить на порции. Простой домашний вариант.",
    "Мягкая текстура и привычный вкус. Подходит для семейного ужина.",
    "Можно приготовить заранее. Удобно разделить на порции и подать тёплым.",
    "Нежный по текстуре вариант для семейного стола. Простой состав.",
    "Удобно нарезать и подать. Простой домашний вариант из привычных продуктов.",
  ],
  stew: [
    "Мягкая текстура и насыщенный вкус. Удобно подать с гарниром или хлебом.",
    "Удобно разделить на порции и подать тёплым. Домашний вариант.",
    "Нежный по консистенции, удобно на общий стол. Простой в подаче.",
    "Подходит для спокойного обеда или ужина. Удобно подать с гарниром.",
  ],
  pasta: [
    "Удобно подать на общий стол. Простой состав из привычных продуктов.",
    "Понятная подача и привычный вкус. Подходит для семейного ужина.",
    "Быстрый вариант без сложных сочетаний. Подавать тёплым.",
    "Лёгкое по вкусу блюдо. Удобно разделить на порции.",
  ],
  meatballs: [
    "Удобно подать с гарниром или соусом. Простой состав и понятная подача.",
    "Мягкая текстура и привычный вкус. Подходит для обеда или ужина.",
    "Удобно разделить на порции. Домашний вариант из знакомых продуктов.",
    "Нежный по текстуре вариант. Удобно подать с гарниром.",
  ],
  salad: [
    "Свежий вариант без лишних сочетаний. Удобно подать к столу.",
    "Простой состав и лёгкая подача. Подходит как закуска или дополнение.",
    "Понятные ингредиенты и быстрая подача. Лёгкое по вкусу.",
  ],
  drink: [
    "Удобно подать холодным или комнатной температуры. Простой состав.",
    "Лёгкий вариант без сложных сочетаний. Подходит для перекуса.",
    "Понятный состав из привычных продуктов. Удобно разделить на порции.",
  ],
  default: [
    "Удобно подать на общий стол и разделить на порции. Простой состав из привычных продуктов.",
    "Мягкая текстура и понятный состав без лишних сочетаний.",
    "Удобно подать и разделить на порции. Подходит для семейного стола.",
    "Нежный по текстуре вариант, удобно подать на общий стол.",
    "Простой домашний вариант из привычных продуктов. Удобно в подаче.",
    "Лёгкое по вкусу блюдо. Удобно разделить на порции.",
  ],
};

/** Только для fallback: слишком общие фразы не используются в основных шаблонах. */
const COMPOSER_FALLBACK =
  "Удобно подать на общий стол и разделить на порции. Простой состав из привычных продуктов.";

export interface ComposeRecipeDescriptionInput {
  title: string;
  mealType?: string | null;
  is_soup?: boolean | null;
  ingredients?: Array<{ name?: string } | string>;
}

export interface ComposeRecipeDescriptionResult {
  text: string;
  variantId: string;
}

/**
 * Собирает финальное описание рецепта. Макс. 160 символов, 1–2 предложения.
 * variantId для лога: "category:index".
 */
export function composeRecipeDescription(recipe: ComposeRecipeDescriptionInput): ComposeRecipeDescriptionResult {
  const title = (recipe.title ?? "").trim() || "Блюдо";
  const ingredientNames = recipe.ingredients
    ? (Array.isArray(recipe.ingredients)
        ? recipe.ingredients.map((i) => (typeof i === "string" ? i : (i as { name?: string }).name ?? ""))
        : []
      ).map((s) => String(s).trim())
      .filter(Boolean)
    : [];
  const category = inferDishCategory({
    title,
    mealType: recipe.mealType,
    is_soup: recipe.is_soup,
    ingredientNames,
  });
  const templates = COMPOSER_TEMPLATES[category] ?? COMPOSER_TEMPLATES.default;
  const seed = title + (ingredientNames[0] ?? "") + (recipe.mealType ?? "");
  const idx = simpleHash(seed) % templates.length;
  const raw = (templates[idx] ?? COMPOSER_FALLBACK).trim();
  const text = raw.slice(0, COMPOSER_DESCRIPTION_MAX_LENGTH);
  const out = text.length > 0 ? text : COMPOSER_FALLBACK.slice(0, COMPOSER_DESCRIPTION_MAX_LENGTH);
  return { text: out, variantId: `${category}:${idx}` };
}
