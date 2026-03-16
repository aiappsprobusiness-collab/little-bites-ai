/**
 * Stage 2: детерминированный description composer.
 * Собирает короткое описание рецепта из meal type, ключевых ингредиентов и шаблонов.
 * Не дублирует title, не рекламный тон, без медицинских обещаний.
 * Макс. 210 символов (совместимость с DESCRIPTION_MAX_LENGTH).
 */

export const COMPOSER_DESCRIPTION_MAX_LENGTH = 210;

/** Ингредиенты, которые не считаем «ключевыми» для описания (технические, нейтральные). */
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

/**
 * Выбирает 1–2 ключевых ингредиента для упоминания в описании.
 * Исключает воду, соль, масло, специи и т.п.
 */
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

/**
 * Определяет категорию блюда по title, mealType, is_soup и ингредиентам.
 */
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

/** Шаблоны: короткие, дополняют title (текстура/подача/ситуация). 1 предложение предпочтительно, при необходимости 2. */
const COMPOSER_TEMPLATES: Record<DishCategory, string[]> = {
  soup: [
    "Мягкая текстура и привычный вкус. Удобно подать на обед и разделить на порции.",
    "Простой вариант на каждый день. Удобно разогреть и подать тёплым.",
    "Нежный по консистенции и простой в подаче. Подходит для семейного обеда.",
  ],
  porridge: [
    "Простой вариант на каждый день. Удобно готовить заранее и разогреть.",
    "Мягкая текстура и понятный состав. Подходит для завтрака или перекуса.",
    "Спокойный домашний вариант из привычных продуктов.",
  ],
  pancake: [
    "Нежная текстура и понятный состав. Подходит для завтрака или перекуса.",
    "Удобно подать на общий стол и разделить на порции.",
    "Простой вариант без лишних сочетаний. Подавать тёплым.",
  ],
  casserole: [
    "Удобно подать на общий стол и разделить на порции. Простой домашний вариант.",
    "Мягкая текстура и привычный вкус. Подходит для семейного ужина.",
    "Простой состав и понятная подача. Можно приготовить заранее.",
  ],
  stew: [
    "Мягкая текстура и насыщенный вкус. Удобно подать с гарниром или хлебом.",
    "Спокойный домашний вариант на каждый день. Простой в подаче.",
    "Удобно разделить на порции и подать тёплым.",
  ],
  pasta: [
    "Удобно подать на общий стол. Простой состав из привычных продуктов.",
    "Быстрый вариант без сложных сочетаний. Подавать тёплым.",
    "Понятная подача и привычный вкус. Подходит для семейного ужина.",
  ],
  meatballs: [
    "Удобно подать с гарниром или соусом. Простой состав и понятная подача.",
    "Мягкая текстура и привычный вкус. Подходит для обеда или ужина.",
    "Удобно разделить на порции. Домашний вариант из знакомых продуктов.",
  ],
  salad: [
    "Свежий вариант без лишних сочетаний. Удобно подать к столу.",
    "Простой состав и лёгкая подача. Подходит как закуска или дополнение.",
    "Понятные ингредиенты и быстрая подача.",
  ],
  drink: [
    "Удобно подать холодным или комнатной температуры. Простой состав.",
    "Лёгкий вариант без сложных сочетаний. Подходит для перекуса.",
    "Понятный состав из привычных продуктов.",
  ],
  default: [
    "Удобно подать на общий стол и разделить на порции. Простой состав из привычных продуктов.",
    "Мягкая текстура и понятный состав без лишних сочетаний.",
    "Спокойный домашний вариант на каждый день.",
    "Удобно подать и разделить на порции. Подходит для семейного стола.",
  ],
};

function simpleHash(str: string): number {
  let h = 0;
  const s = (str ?? "").trim();
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Универсальный fallback, если composer не смог собрать описание. */
const COMPOSER_FALLBACK =
  "Удобно подать на общий стол и разделить на порции. Простой состав из привычных продуктов.";

export interface ComposeRecipeDescriptionInput {
  title: string;
  mealType?: string | null;
  is_soup?: boolean | null;
  ingredients?: Array<{ name?: string } | string>;
}

/**
 * Собирает финальное описание рецепта: короткое, дополняющее title, без дублирования названия.
 * Всегда возвращает непустую строку длиной не более COMPOSER_DESCRIPTION_MAX_LENGTH.
 */
export function composeRecipeDescription(recipe: ComposeRecipeDescriptionInput): string {
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
  const raw = (templates[idx] ?? COMPOSER_TEMPLATES.default[0] ?? COMPOSER_FALLBACK).trim();
  const out = raw.slice(0, COMPOSER_DESCRIPTION_MAX_LENGTH);
  return out.length > 0 ? out : COMPOSER_FALLBACK.slice(0, COMPOSER_DESCRIPTION_MAX_LENGTH);
}
