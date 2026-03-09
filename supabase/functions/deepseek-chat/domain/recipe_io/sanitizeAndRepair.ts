/**
 * Санитизация и ремонт рецепта: описание (≤170 символов), совет шефа (≤280), минимальный fallback.
 * Без дополнительных LLM: trim, нормализация пробелов, усечение по границе предложения, детерминированные fallback.
 * Quality gate: запрещённые фразы, абстрактные зачины — замена на fallback.
 */

import type { RecipeJson } from "../../recipeSchema.ts";

/** Максимальная длина description (ровно 2 предложения о пользе). */
export const DESCRIPTION_MAX_LENGTH = 210;

/** Максимальная длина chefAdvice (2–3 коротких предложения). */
export const CHEF_ADVICE_MAX_LENGTH = 280;

/** Минимальная длина description; ниже — подставляем fallback. */
const DESCRIPTION_MIN_FOR_VALID = 60;

const DESCRIPTION_INCOMPLETE_SUFFIXES = [/\sи\s*$/i, /\sили\s*$/i, /\sа также\s*$/i, /[—:]\s*$/];

export function isDescriptionIncomplete(desc: string | null | undefined): boolean {
  if (!desc || typeof desc !== "string") return false;
  const t = desc.trim();
  if (t.length < 20) return true;
  if (/\.\.\.\s*$/.test(t)) return true;
  if (DESCRIPTION_INCOMPLETE_SUFFIXES.some((re) => re.test(t))) return true;
  return false;
}

function normalizeSpaces(s: string): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

/** Ищет последнюю границу предложения (. ! ? …) в пределах maxLen; иначе последний пробел. Не режет посередине слова. */
function truncateAtSentenceBoundary(text: string, maxLen: number): string {
  const t = normalizeSpaces(text);
  if (t.length <= maxLen) return t;
  const slice = t.slice(0, maxLen + 1);
  const lastSentenceEnd = Math.max(
    slice.lastIndexOf("."),
    slice.lastIndexOf("!"),
    slice.lastIndexOf("?"),
    slice.lastIndexOf("…")
  );
  if (lastSentenceEnd > 0) {
    return slice.slice(0, lastSentenceEnd + 1).trim();
  }
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace > 0) {
    return slice.slice(0, lastSpace).trim() + ".";
  }
  return t.slice(0, maxLen).trim() + ".";
}

/** Обрезка по границе слова: в последних minFromEnd символах ищем последний пробел, режем там. Не режет слово. */
function truncateAtWordBoundary(text: string, maxLen: number, minFromEnd: number = 20): string {
  const t = normalizeSpaces(text);
  if (t.length <= maxLen) return t;
  const slice = t.slice(0, maxLen);
  const searchStart = Math.max(0, slice.length - minFromEnd);
  const segment = slice.slice(searchStart);
  const lastSpaceInSegment = segment.lastIndexOf(" ");
  const cutAt = lastSpaceInSegment >= 0 ? searchStart + lastSpaceInSegment : slice.lastIndexOf(" ");
  if (cutAt > 0) {
    return slice.slice(0, cutAt).trim();
  }
  return slice.trim();
}

/** Удаляет хвосты «Хранить…» / «Можно хранить…» из description. */
function stripStorageTail(text: string): string {
  const t = normalizeSpaces(text);
  const m = t.match(/^(.+?)(?:\s+Хранить[^.!?]*\.?\s*$|\s+Можно хранить[^.!?]*\.?\s*$)/i);
  if (m && m[1]) return m[1].trim();
  return t;
}

/** Хвосты, на которых description не должен заканчиваться (обрубки). */
const DESCRIPTION_BAD_ENDINGS = /\s+(в|на|и|или|а|—|:)\s*\.?$/i;

/** Убирает обрубок в конце: если строка заканчивается предлогом/частицей — обрезаем до предыдущего слова и ставим точку. */
function trimBadDescriptionEnd(s: string): string {
  const t = normalizeSpaces(s);
  if (!t.length) return t;
  if (!DESCRIPTION_BAD_ENDINGS.test(t)) return t;
  const withoutBad = t.replace(DESCRIPTION_BAD_ENDINGS, "").trim();
  if (!withoutBad.length) return t;
  const lastSpace = withoutBad.lastIndexOf(" ");
  const base = lastSpace <= 0 ? withoutBad : withoutBad.slice(0, lastSpace).trim();
  const alreadyEnds = /[.!?]$/.test(base);
  return alreadyEnds ? base : base + ".";
}

/** Benefit-based fallback по типу блюда: [предложение 1, предложение 2]. */
const DESCRIPTION_BENEFIT_BY_TYPE: Record<string, [string, string][]> = {
  porridge: [
    ["Овсянка и каши дают медленные углеводы и клетчатку для ровной энергии.", "Мягкая нагрузка на пищеварение и длительная сытость."],
    ["Каша поддерживает стабильный уровень энергии за счёт медленных углеводов.", "Клетчатка благоприятна для пищеварения и сытости."],
  ],
  cottage: [
    ["Творог и запеканки содержат белок и кальций для костей и сытости.", "Удобны для длительной энергии без лишней тяжести."],
    ["Белок и кальций в твороге важны для костей и мышц.", "Даёт сытость и поддержку в течение дня."],
  ],
  meat: [
    ["Курица и мясо дают полноценный белок для сытости и поддержки мышц.", "Железо способствует кроветворению и тонусу."],
    ["Белок и железо из мяса поддерживают мышцы и энергию.", "Сытное блюдо с хорошей усвояемостью."],
  ],
  fish: [
    ["Рыба — источник белка и полезных жиров для мозга и сытости.", "Лёгкая нагрузка на пищеварение при высокой питательности."],
    ["Белок и омега-жиры в рыбе поддерживают сытость и тонус.", "Удобно для разнообразного и сбалансированного рациона."],
  ],
  vegetables: [
    ["Овощи дают клетчатку и витамин C для пищеварения и иммунитета.", "Низкая калорийность при хорошем объёме и сытости."],
    ["Цветная капуста и брокколи — клетчатка и витамины для пищеварения.", "Лёгкое и питательное сочетание."],
  ],
  pumpkin: [
    ["Тыква и морковь содержат бета-каротин для зрения и иммунитета.", "Мягкий вкус и комфорт для пищеварения."],
    ["Бета-каротин в тыкве полезен для кожи и тонуса.", "Клетчатка поддерживает пищеварение."],
  ],
  fruit: [
    ["Яблоко и груша добавляют пектин для пищеварения и мягкую сладость.", "Клетчатка и витамины без лишнего сахара."],
    ["Пектин во фруктах благоприятен для пищеварения.", "Натуральная сладость и лёгкость."],
  ],
  grain: [
    ["Киноа и гречка дают клетчатку, железо и медленные углеводы.", "Сытость и поддержка энергии надолго."],
    ["Крупы — источник клетчатки и железа для крови и тонуса.", "Медленные углеводы для ровной энергии."],
  ],
  default: [
    ["Блюдо даёт белок и питательные вещества для сытости.", "Клетчатка и витамины поддерживают пищеварение и энергию."],
    ["Содержит белок и углеводы для длительной сытости.", "Овощи или крупы добавляют клетчатку и минералы."],
  ],
};

function detectDescriptionDishType(title: string, ingredients: string[] = [], mealType?: string): string {
  const text = [title, ...ingredients].join(" ").toLowerCase();
  if (/\b(каша|овсянк|пшён|рисовая|гречневые|размазня)\b/.test(text)) return "porridge";
  if (/\b(творог|запеканк|сырник)\b/.test(text)) return "cottage";
  if (/\b(куриц|индейк|говядин|свинин|фарш|котлет|фрикадел|тефтел)\b/.test(text)) return "meat";
  if (/\b(рыб|лосось|треск|минтай|судак)\b/.test(text)) return "fish";
  if (/\b(тыкв|морковь)\b/.test(text)) return "pumpkin";
  if (/\b(яблок|груш|персик|абрикос)\b/.test(text)) return "fruit";
  if (/\b(киноа|гречк|булгур)\b/.test(text)) return "grain";
  if (/\b(капуст|брокколи|овощ|цукини|кабачок|томат|перец)\b/.test(text)) return "vegetables";
  return "default";
}

function simpleHash(str: string): number {
  let h = 0;
  const s = (str ?? "").trim();
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function pickByHash<T>(arr: T[], seed: string): T {
  const idx = simpleHash(seed) % arr.length;
  return arr[idx] ?? arr[0];
}

/** Нормализация title для сравнения (как в index.ts anti-duplicate). */
function normalizeTitleKey(title: string): string {
  return (title ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Универсальные fallback для description (польза, 2 предложения, ≤210). */
const DESCRIPTION_POOL_FALLBACKS = [
  "Блюдо даёт белок и полезные жиры для сытости и поддержки энергии. Овощи добавляют клетчатку и витамины для пищеварения.",
  "Содержит белок и медленные углеводы для длительной сытости. Клетчатка и минералы поддерживают пищеварение и тонус.",
];

/**
 * Убирает дубль title из description: если description содержит нормализованный title или начинается с названия — подставляет универсальный fallback (без названия, без профиля/детей/аллергий).
 */
export function sanitizeDescriptionForPool(description: string | null | undefined, title: string, recipeIdSeed?: string): string {
  const desc = normalizeSpaces(description ?? "");
  const t = (title ?? "").trim();
  if (!t || desc.length < 10) return desc;
  const titleKey = normalizeTitleKey(t);
  if (!titleKey) return desc;
  const descLower = desc.toLowerCase().replace(/\s+/g, " ");
  const titleWords = titleKey.split(" ").filter((w) => w.length >= 2);
  const startsWithTitle = titleWords.length > 0 && descLower.startsWith(titleWords[0]!);
  const containsTitleKey = descLower.includes(titleKey) || titleWords.some((w) => descLower.includes(w) && desc.length < 80);
  if (startsWithTitle || containsTitleKey) {
    const seed = (recipeIdSeed ?? t + desc.slice(0, 20)).trim() || "default";
    const idx = simpleHash(seed) % DESCRIPTION_POOL_FALLBACKS.length;
    return (DESCRIPTION_POOL_FALLBACKS[idx] ?? DESCRIPTION_POOL_FALLBACKS[0]!).slice(0, DESCRIPTION_MAX_LENGTH);
  }
  return desc.slice(0, DESCRIPTION_MAX_LENGTH);
}

export function buildDescriptionFallback(options: {
  title?: string;
  keyIngredient?: string;
  recipeIdSeed?: string;
  mealType?: string;
  ingredients?: string[];
}): string {
  const title = (options.title ?? "").trim() || "Блюдо";
  const ingNames = (options.ingredients ?? []).map((i) => (typeof i === "string" ? i : "").trim()).filter(Boolean);
  const seed = (options.recipeIdSeed ?? title + (ingNames[0] ?? "")).trim() || "default";
  const dishType = detectDescriptionDishType(title, ingNames, options.mealType);
  const templates = DESCRIPTION_BENEFIT_BY_TYPE[dishType] ?? DESCRIPTION_BENEFIT_BY_TYPE.default;
  const pair = templates[simpleHash(seed) % templates.length] ?? templates[0]!;
  const out = `${pair[0]} ${pair[1]}`.trim();
  return normalizeSpaces(out).slice(0, DESCRIPTION_MAX_LENGTH);
}

/**
 * Приводит description к лимиту: обрезка по границе слова (не резать посередине), завершённое предложение;
 * убираем хвосты «Хранить»/«Можно хранить» и обрубки (окончание на «в», «и» и т.д.); при <60 — fallback.
 */
export function enforceDescription(
  desc: string | null | undefined,
  context?: { title?: string; keyIngredient?: string; recipeIdSeed?: string; mealType?: string; ingredients?: string[] }
): string {
  let t = normalizeSpaces(desc ?? "");
  t = stripStorageTail(t);
  if (t.length > 0 && descriptionFailsQualityGate(t)) {
    t = buildDescriptionFallback({
      title: context?.title ?? "",
      keyIngredient: context?.keyIngredient,
      recipeIdSeed: context?.recipeIdSeed,
      mealType: context?.mealType,
      ingredients: context?.ingredients,
    });
  }
  if (t.length > DESCRIPTION_MAX_LENGTH) {
    t = truncateAtSentenceBoundary(t, DESCRIPTION_MAX_LENGTH);
    if (t.length > DESCRIPTION_MAX_LENGTH) {
      t = truncateAtWordBoundary(t, DESCRIPTION_MAX_LENGTH, 20);
      if (!/[.!?…]\s*$/.test(t)) t = t.trim() + ".";
    }
  }
  t = trimBadDescriptionEnd(t);
  if (t.length > DESCRIPTION_MAX_LENGTH) {
    t = truncateAtWordBoundary(t, DESCRIPTION_MAX_LENGTH, 20);
    if (!/[.!?…]\s*$/.test(t)) t = t.trim() + ".";
  }
  if (t.length > 1 && !/[.!?…]\s*$/.test(t)) {
    const lastSpace = t.trim().lastIndexOf(" ");
    t = (lastSpace > 0 ? t.slice(0, lastSpace) : t).trim();
    if (!/[.!?…]\s*$/.test(t)) t = t + ".";
  }
  if (t.length < DESCRIPTION_MIN_FOR_VALID || !t.replace(/[.\s]/g, "").length) {
    t = buildDescriptionFallback({
      title: context?.title ?? "",
      keyIngredient: context?.keyIngredient,
      recipeIdSeed: context?.recipeIdSeed,
      mealType: context?.mealType,
      ingredients: context?.ingredients,
    });
  }
  return t.slice(0, DESCRIPTION_MAX_LENGTH);
}

/** Запрещённые старты: при совпадении совет пересобирается из fallback. */
const CHEF_ADVICE_FORBIDDEN_STARTS = [
  /^для максимальной\s/i,
  /^для более\s/i,
  /^для получения\s/i,
  /^если хотите\s/i,
  /^вы можете\s/i,
  /^чтобы сделать\s/i,
  /^чтобы блюдо получилось\s/i,
  /^это позволит\s/i,
  /^данное блюдо\s/i,
  /^это блюдо\s/i,
  /^подавайте\s/i,
  /^можно\s/i,
  /^рекомендуем\s/i,
  /^совет:\s/i,
  /^важно\s/i,
  /^вкус\s/i,
];

/** Кривой штамп — при наличии совет пересобирается. */
const CHEF_ADVICE_BROKEN_PHRASE = /вкус\s+насыщенного\s+вкуса/i;

/** Фразы в description: при наличии — подставляем fallback. */
const DESCRIPTION_FORBIDDEN_PHRASES = [
  "это блюдо",
  "идеально подходит",
  "приятный вкус",
  "приятная текстура",
  "универсальный",
  "подходит для всей семьи",
  "сбалансированное блюдо",
  "простое в приготовлении блюдо",
  "простое блюдо",
  "насыщенный вкус",
  "универсальное блюдо",
  "в составе",
  "главный ингредиент",
  "отличный выбор для разнообразия",
  "разнообразия рациона",
  "готовится быстро",
  "хранится в холодильнике",
  "можно подавать",
  "получается ароматным",
  "сытное, но не тяжёлое",
  "легко повторить",
  "подходит для",
];

/** Хотя бы один маркер конкретики в chefAdvice (техника, температура, порядок). Нет маркера — считаем общим, используем fallback. */
const CHEF_ADVICE_CONCRETE_MARKERS = [
  /обжар/i, /запек/i, /прогр/i, /перемеш/i, /добав/i, /в конце/i, /перед подачей/i,
  /на слабом огне/i, /под крышкой/i, /до золотистой корочки/i, /чтобы соус/i, /чтобы сохранить/i,
  /дайте настояться/i, /влажными руками/i, /не перегрей/i, /не перевар/i, /убавь/i, /сними с огня/i,
];

/** Проверяет, нужно ли пересобрать совет (запрещённый старт или штамп). */
export function hasForbiddenChefAdviceStart(text: string | null | undefined): boolean {
  const t = normalizeSpaces(text ?? "");
  if (!t.length) return false;
  if (CHEF_ADVICE_BROKEN_PHRASE.test(t)) return true;
  return CHEF_ADVICE_FORBIDDEN_STARTS.some((re) => re.test(t));
}

/** Есть ли в совете хотя бы один конкретный кулинарный маркер. */
function hasConcreteChefAdviceMarker(text: string): boolean {
  const t = normalizeSpaces(text).toLowerCase();
  if (t.length < 25) return false;
  return CHEF_ADVICE_CONCRETE_MARKERS.some((re) => re.test(t));
}

/** Проверка quality gate для description: запрещённые фразы или штампы. */
function descriptionFailsQualityGate(desc: string): boolean {
  const t = normalizeSpaces(desc).toLowerCase();
  return DESCRIPTION_FORBIDDEN_PHRASES.some((phrase) => t.includes(phrase));
}

/** Известные штампы — слишком общий совет без конкретики. */
const CHEF_ADVICE_GENERIC_STAMPS = [
  "добавьте специи по вкусу",
  "подавайте горячим",
  "украсьте зеленью",
  "можно подать с хлебом",
  "храните в холодильнике",
  "разогрейте перед подачей",
  "добавьте соль по вкусу",
  "попробуйте и скорректируйте",
  "идеально для семейного ужина",
  "подойдёт на любой случай",
];

function isGenericChefAdvice(text: string): boolean {
  const t = normalizeSpaces(text).toLowerCase();
  if (t.length < 30) return true;
  if (CHEF_ADVICE_GENERIC_STAMPS.some((stamp) => t.includes(stamp.toLowerCase()) && t.length < 120)) return true;
  return false;
}

/** Fallback по типу блюда (каша/пюре, суп, фрикадельки/котлеты, запеканка, оладьи/панкейки). Все ≤280 символов. */
const CHEF_ADVICE_BY_DISH_TYPE: Record<string, string[]> = {
  porridge: [
    "Добавьте масло в конце — каша станет нежнее. Подавайте тёплой.",
    "Уварите до нужной густоты на слабом огне, помешивая. Не переваривайте.",
  ],
  soup: [
    "Зелень и масло добавляйте в тарелку перед подачей — аромат сохранится.",
    "Не кипятите долго после закладки зелени. Подавайте горячим.",
  ],
  meatballs: [
    "Формуйте влажными руками — фарш не липнет. Дайте дойти под крышкой 5 минут.",
    "Не пересушивайте: после обжарки потушите под крышкой на малом огне.",
  ],
  casserole: [
    "Дайте запеканке постоять 5–7 минут после духовки — так проще нарезать.",
    "Не вынимайте сразу: дайте остыть в форме 5 минут, потом режьте.",
  ],
  pancakes: [
    "Жарьте на умеренном огне. Не переворачивайте слишком рано — дождитесь пузырьков.",
    "Первый блин может выйти комом — смажьте сковороду перед ним.",
  ],
  default: [
    "Дайте блюду 2–3 минуты постоять под крышкой — сочность распределится.",
    "Добавьте зелень и специи в конце — аромат сохранится. Подавайте тёплым.",
    "Нарежьте овощи одинаково — приготовятся одновременно. Не переваривайте.",
  ],
};

function detectDishType(title: string, ingredients: string[] = [], steps: string[] = []): string {
  const text = [title, ...ingredients, ...steps].join(" ").toLowerCase();
  if (/\b(каша|пюре|размазня)\b/.test(text)) return "porridge";
  if (/\b(суп|бульон|борщ|солянка|гаспачо)\b/.test(text)) return "soup";
  if (/\b(фрикадел|котлет|тефтел|биточк)\b/.test(text)) return "meatballs";
  if (/\b(запеканк|гратен|лазанья)\b/.test(text)) return "casserole";
  if (/\b(оладь|блин|панкейк|сырник)\b/.test(text)) return "pancakes";
  return "default";
}

/** Шаблоны для пула (sanitizeChefAdviceForPool): короткие, ≤280. */
const POOL_SAFE_CHEF_ADVICE_TEMPLATES: string[] = [
  "Запекайте первые 15 минут при высокой температуре, затем убавьте — корочка и сок внутри.",
  "Дайте блюду 2–3 минуты постоять под крышкой — сочность распределится.",
  "Нарежьте овощи одинаково — приготовятся одновременно. Не переваривайте.",
  "Добавьте зелень в конце — аромат сохранится. Подавайте тёплым.",
  "Снимите с огня и дайте постоять 1–2 минуты — соки распределятся.",
];

/** Триггеры запрещённого контента в chefAdvice: аллергии/ограничения/профиль. */
const CHEF_ADVICE_POOL_FORBIDDEN_ALLERGIES = /бкм|аллерг|неперенос|без\s+молоч|без\s+лакт|коровь(его|ий)\s+бел(ок|ка)|по\s+аллерг|учитыва(я|йте)\s+аллерг/i;
/** Дети/возраст/семья/общий стол. */
const CHEF_ADVICE_POOL_FORBIDDEN_FAMILY = /(дет(ям|и|ский)|реб(ен(ок|ка)|ён(ок|ка))|малыш|семь(я|и)|общ(ий|его)\s+стол|для\s+детей)/i;
/** «Ты»-обращение. */
const CHEF_ADVICE_POOL_FORBIDDEN_TY = /(^|[\s,.:;!?])(ты|тебе|твой|твоя|твоё|твоим|твоей|давай|ваш(?:ему|ей|е)?\s*малышу)([\s,.:;!?]|$)/i;

function buildPoolSafeChefAdviceFallback(recipeIdSeed: string): string {
  const idx = simpleHash(recipeIdSeed) % POOL_SAFE_CHEF_ADVICE_TEMPLATES.length;
  return (POOL_SAFE_CHEF_ADVICE_TEMPLATES[idx] ?? POOL_SAFE_CHEF_ADVICE_TEMPLATES[0]!).slice(0, CHEF_ADVICE_MAX_LENGTH);
}

/**
 * Вычищает chefAdvice от упоминаний профиля, аллергий, детей/семьи и «ты». При любом триггере пересобирает совет из pool-safe шаблона (без LLM).
 */
export function sanitizeChefAdviceForPool(advice: string | null | undefined, recipeIdSeed?: string): string {
  const t = normalizeSpaces(advice ?? "");
  if (!t.length) return t;
  const seed = (recipeIdSeed ?? "default").trim() || "default";
  if (CHEF_ADVICE_POOL_FORBIDDEN_ALLERGIES.test(t) || CHEF_ADVICE_POOL_FORBIDDEN_FAMILY.test(t) || CHEF_ADVICE_POOL_FORBIDDEN_TY.test(t)) {
    return buildPoolSafeChefAdviceFallback(seed);
  }
  return t;
}

/** Определяет обрыв: не заканчивается на .!?… или заканчивается на запятую/двоеточие/тире, или мусорный хвост (2–4 буквы). */
function isChefAdviceTruncated(advice: string): boolean {
  const trimmed = advice.trim();
  if (!trimmed.length) return true;
  if (/[.!?…]\s*$/.test(trimmed)) return false;
  if (/[,—:]\s*$/.test(trimmed)) return true;
  const lastWord = trimmed.split(/\s+/).pop() ?? "";
  if (lastWord.length >= 2 && lastWord.length <= 4 && !/[.!?]/.test(lastWord)) return true;
  return true;
}

/**
 * Убирает лишние точки в середине предложения: «и сразу. перемешайте» → «и сразу перемешайте».
 * Срабатывает, когда после точки идёт пробел и строчная буква (продолжение фразы, не новое предложение).
 */
function fixChefAdviceSpuriousPeriods(advice: string): string {
  return normalizeSpaces(advice).replace(/\.\s+([a-zа-яё])/g, " $1");
}

/**
 * Вставляет точку между склеенными предложениями: «творог Слегка» → «творог. Слегка».
 * Срабатывает, когда после строчной буквы идёт пробел и слово, типично начинающее новое предложение.
 */
function fixChefAdviceRunOnSentences(advice: string): string {
  const t = normalizeSpaces(advice);
  if (t.length < 20) return t;
  const sentenceStarters =
    "Слегка|Подсушите|Добавьте|Подавайте|Дайте|Положите|Затем|Перемешайте|Нарежьте|Выложите|Запекайте|Тушите|Жарьте|Варите|Снимите|Убавьте|Остудите|Разогрейте|Натирайте|Выкладывайте|Готовьте|Обжарьте|Доведите|Оставьте|Смажьте|Не переусердствуйте|Готовые";
  const re = new RegExp(`([а-яё])\\s+(${sentenceStarters})(?=\\s|$|[.,!?])`, "gi");
  return t.replace(re, "$1. $2");
}

/** Обрезает до последнего завершённого предложения и при необходимости добавляет короткое закрывающее (на «Вы»). */
function fixChefAdviceTruncation(advice: string): string {
  let t = normalizeSpaces(advice);
  if (!t.length || !isChefAdviceTruncated(t)) return t;
  const lastEnd = Math.max(t.lastIndexOf("."), t.lastIndexOf("!"), t.lastIndexOf("?"), t.lastIndexOf("…"));
  if (lastEnd > 0) {
    t = t.slice(0, lastEnd + 1).trim();
  } else {
    const lastSpace = t.lastIndexOf(" ");
    t = (lastSpace > 0 ? t.slice(0, lastSpace) : t).trim() + ".";
  }
  if (countSentences(t) < 2) {
    t = normalizeSpaces(t + " Подавайте тёплым.").slice(0, CHEF_ADVICE_MAX_LENGTH);
  }
  return t;
}

/** Детерминированный fallback для chefAdvice по типу блюда (без LLM). */
export function buildChefAdviceFallback(options: {
  title?: string;
  ingredients?: string[];
  steps?: string[];
  recipeIdSeed?: string;
  mealType?: string;
}): string {
  const title = (options.title ?? "").trim();
  const ingNames = (options.ingredients ?? []).map((i) => (typeof i === "string" ? i : "").trim()).filter(Boolean);
  const steps = (options.steps ?? []).map((s) => (typeof s === "string" ? s : "").trim()).filter(Boolean);
  const dishType = detectDishType(title, ingNames, steps);
  const templates = CHEF_ADVICE_BY_DISH_TYPE[dishType] ?? CHEF_ADVICE_BY_DISH_TYPE.default;
  const seed = (options.recipeIdSeed ?? title + (ingNames[0] ?? "") + (steps[0] ?? "")).trim() || "default";
  const idx = simpleHash(seed) % templates.length;
  return normalizeSpaces(templates[idx] ?? templates[0]!).slice(0, CHEF_ADVICE_MAX_LENGTH);
}

/** Паттерн «ты»-обращения: переписываем на «Вы» без вызова LLM. Граница — пробел/начало/конец/знак препинания (кириллица не поддерживает \\b). */
const CHEF_ADVICE_TY_PATTERN = /(^|[\s,.:;!?])+(ты|тебе|твой|твоя|твоё|твоим|твоей|давай)([\s,.:;!?]|$)/i;

const TY_TO_VY_MAP: Record<string, string> = {
  ты: "вы", тебе: "вам", твой: "ваш", твоя: "ваша", твоё: "ваше",
  твоим: "вашим", твоей: "вашей", давай: "лучше",
};

/** Замена «ты» на «Вы» и нейтральные конструкции (без LLM). */
function rewriteChefAdviceTyToVy(advice: string): string {
  let t = normalizeSpaces(advice);
  t = t.replace(/(^|[\s,.:;!?])(ты|тебе|твой|твоя|твоё|твоим|твоей|давай)([\s,.:;!?]|$)/gi, (_m, before, word, after) => {
    const replacement = TY_TO_VY_MAP[word.toLowerCase()] ?? word;
    return before + replacement + after;
  });
  return normalizeSpaces(t);
}

/** Считает предложения по границам . ! ? */
function countSentences(text: string): number {
  const t = text.trim();
  if (!t.length) return 0;
  const matches = t.match(/[.!?]+/g);
  return matches ? matches.length : (t.length > 0 ? 1 : 0);
}

/** Нутритивные маркеры: в description должен быть хотя бы один (подстрока). */
const DESCRIPTION_NUTRITIONAL_MARKERS = [
  "белок", "клетчатк", "желез", "кальци", "витамин", "бета-каротин",
  "медленные углеводы", "полезные жиры", "пищевар", "сытост", "энерги",
  "кости", "мышц", "кроветвор", "пектин", "усвоени",
];

function hasNutritionalMarker(text: string): boolean {
  const t = text.toLowerCase();
  return DESCRIPTION_NUTRITIONAL_MARKERS.some((m) => t.includes(m));
}

function descriptionStartsWithTitle(desc: string, title: string): boolean {
  const t = normalizeSpaces(desc);
  const titleKey = normalizeTitleKey(title);
  if (!titleKey || t.length < 10) return false;
  const firstWord = t.split(/\s+/)[0] ?? "";
  const titleWords = titleKey.split(/\s+/).filter((w) => w.length >= 2);
  if (titleWords.length > 0 && firstWord.toLowerCase() === titleWords[0]!.toLowerCase()) return true;
  const descLower = t.toLowerCase().slice(0, 50);
  return descLower.startsWith(titleKey.slice(0, 15)) || titleWords.some((w) => descLower.startsWith(w));
}

function lastSentenceComplete(text: string): boolean {
  const t = normalizeSpaces(text);
  if (!t.length) return false;
  return /[.!?…]\s*$/.test(t) && !/\s(и|или|а|в|на|что|котор|для|чтобы)\s*\.?\s*$/i.test(t);
}

/** Quality gate для description: длина ≤210, ровно 2 предложения, нет запретов, не с title, завершено, есть нутритивный маркер. */
export function passesDescriptionQualityGate(
  desc: string | null | undefined,
  options?: { title?: string }
): boolean {
  const t = normalizeSpaces(desc ?? "");
  if (t.length < 50 || t.length > DESCRIPTION_MAX_LENGTH) return false;
  if (countSentences(t) !== 2) return false;
  if (descriptionFailsQualityGate(t)) return false;
  if (options?.title && descriptionStartsWithTitle(t, options.title)) return false;
  if (!lastSentenceComplete(t)) return false;
  return hasNutritionalMarker(t);
}

/** Проверка качества chefAdvice для retry: минимум 2 предложения, нет запрещённых зачинов. */
export function passesChefAdviceQualityGate(advice: string | null | undefined): boolean {
  const t = normalizeSpaces(advice ?? "");
  if (t.length < 30) return false;
  if (countSentences(t) < 2) return false;
  return !hasForbiddenChefAdviceStart(t);
}

/** Добавляет второе предложение, если только одно (без LLM). */
function ensureTwoSentences(advice: string): string {
  if (countSentences(advice) >= 2) return advice;
  const suffix = " Это поможет сохранить вкус и текстуру.";
  return normalizeSpaces(advice.trim() + suffix).slice(0, CHEF_ADVICE_MAX_LENGTH);
}

/**
 * Приводит chefAdvice к лимиту. Quality gate: запрещённый старт, нет конкретного маркера, общий штамп → fallback.
 * При «ты» — переписываем на «Вы», без искусственного добивания длины.
 */
export function enforceChefAdvice(
  advice: string | null | undefined,
  context?: { title?: string; ingredients?: string[]; steps?: string[]; cookingTimeMinutes?: number; recipeIdSeed?: string }
): string {
  let t = normalizeSpaces(advice ?? "");
  const seed = (context?.recipeIdSeed ?? (context?.title ?? "") + (context?.ingredients?.[0] ?? "") + (context?.steps?.[0] ?? "")).trim() || "default";

  t = fixChefAdviceSpuriousPeriods(t);
  t = fixChefAdviceRunOnSentences(t);
  t = fixChefAdviceTruncation(t);

  if (CHEF_ADVICE_TY_PATTERN.test(t)) {
    t = rewriteChefAdviceTyToVy(t);
    if (countSentences(t) < 2) t = ensureTwoSentences(t);
    if (t.length > CHEF_ADVICE_MAX_LENGTH) t = truncateAtSentenceBoundary(t, CHEF_ADVICE_MAX_LENGTH);
    return t.slice(0, CHEF_ADVICE_MAX_LENGTH);
  }

  if (hasForbiddenChefAdviceStart(t)) {
    return buildChefAdviceFallback({
      title: context?.title,
      ingredients: context?.ingredients,
      steps: context?.steps,
      recipeIdSeed: seed,
    });
  }
  if (t.length < 20) {
    return buildChefAdviceFallback({
      title: context?.title,
      ingredients: context?.ingredients,
      steps: context?.steps,
      recipeIdSeed: seed,
    });
  }
  if (t.length > CHEF_ADVICE_MAX_LENGTH) {
    t = truncateAtSentenceBoundary(t, CHEF_ADVICE_MAX_LENGTH);
  }
  return t.slice(0, CHEF_ADVICE_MAX_LENGTH);
}

/** Один короткий вызов LLM только для description: польза блюда, 2 предложения, макс. 210. */
export async function repairDescriptionOnly(current: string, apiKey: string): Promise<string | null> {
  const sys = "Верни ТОЛЬКО JSON: {\"description\": \"...\"}. Ровно 2 коротких предложения, макс. 210 символов. Предложение 1 — основная польза блюда. Предложение 2 — 1–2 нутритивных акцента (белок, клетчатка, железо, кальций, витамин C, бета-каротин, сытость, энергия, пищеварение). Не начинать с названия блюда. Запрещено: «это блюдо», «в составе», «подходит для», «приятная текстура», «разнообразие рациона». Оба предложения закончить точкой.";
  const user = `Исправь описание: «${current.slice(0, 250)}». Дай 2 законченных предложения о пользе, макс. 210 символов.`;
  try {
    const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [{ role: "system", content: sys }, { role: "user", content: user }],
        max_tokens: 128,
        temperature: 0.3,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = data?.choices?.[0]?.message?.content?.trim();
    if (!raw) return null;
    const match = raw.match(/\{\s*"description"\s*:\s*"([^"]*(?:\\.[^"]*)*)"\s*\}/) || raw.match(/"description"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/);
    if (match && match[1]) {
      const desc = match[1].replace(/\\"/g, '"');
      return enforceDescription(desc, {}).slice(0, DESCRIPTION_MAX_LENGTH);
    }
    return null;
  } catch {
    return null;
  }
}

const FORBIDDEN_PATTERNS = [
  /your child/gi,
  /your baby/gi,
  /your toddler/gi,
  /for your child/gi,
  /for your baby/gi,
  /for this child/gi,
  /\d+\s*(month|months|year|years)\s*(old)?/gi,
  /toddler/gi,
  /baby/gi,
  /\bchild\b/gi,
  /for children/gi,
  /для ребёнка/gi,
  /для ребенка/gi,
  /для малыша/gi,
  /для детей/gi,
  /\d+\s*(мес|месяц|месяцев|год|года|лет)\s*(\.|,|$)/gi,
  /с аллергией\s+на/gi,
  /аллергией на/gi,
  /готовится без[^.!?]*[.!?]?/gi,
  /приготовлено без[^.!?]*[.!?]?/gi,
  /,?\s*без\s+[а-яё]+\s+и\s+[а-яё]+[^.!?]*[.!?]?/gi,
];

export function sanitizeRecipeText(text: string | null | undefined): string {
  if (text == null || typeof text !== "string") return text ?? "";
  let result = text;
  for (const pattern of FORBIDDEN_PATTERNS) {
    result = result.replace(pattern, " ");
  }
  return result.replace(/\s+/g, " ").trim();
}

const MEAL_MENTION_PATTERNS = [
  /breakfast/gi,
  /lunch/gi,
  /dinner/gi,
  /snack/gi,
  /morning/gi,
  /evening/gi,
  /на завтрак/gi,
  /на обед/gi,
  /на ужин/gi,
  /на перекус/gi,
  /для завтрака/gi,
  /для перекуса/gi,
  /для обеда/gi,
  /для ужина/gi,
];

export function sanitizeMealMentions(text: string | null | undefined): string {
  if (text == null || typeof text !== "string") return text ?? "";
  let result = text;
  for (const pattern of MEAL_MENTION_PATTERNS) {
    result = result.replace(pattern, " ");
  }
  return result.replace(/\s+/g, " ").trim();
}

export function getMinimalRecipe(mealType: string): RecipeJson {
  const mt = ["breakfast", "lunch", "snack", "dinner"].includes(mealType) ? mealType : "snack";
  return {
    title: "Простой рецепт",
    description: "Быстрый вариант. Попробуйте запрос ещё раз для полного рецепта.",
    ingredients: [
      { name: "Ингредиент 1", amount: "100 г", displayText: "Ингредиент 1 — 100 г", canonical: { amount: 100, unit: "g" } },
      { name: "Ингредиент 2", amount: "2 шт.", displayText: "Ингредиент 2 — 2 шт.", canonical: { amount: 2, unit: "g" } },
      { name: "Ингредиент 3", amount: "1 ст.л.", displayText: "Ингредиент 3 — 1 ст.л.", canonical: { amount: 1, unit: "ml" } },
    ],
    steps: ["Подготовьте ингредиенты.", "Смешайте и готовьте по инструкции.", "Подавайте."],
    cookingTimeMinutes: 15,
    mealType: mt as "breakfast" | "lunch" | "snack" | "dinner",
    servings: 1,
    chefAdvice: null,
  };
}
