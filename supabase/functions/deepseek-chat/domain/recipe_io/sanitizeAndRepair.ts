/**
 * Санитизация и ремонт рецепта: описание (≤150 символов), совет шефа (≤350), минимальный fallback.
 * Без дополнительных LLM: trim, нормализация пробелов, усечение по границе предложения, детерминированные fallback.
 * При «ты»-обращении в chefAdvice — локальная замена на «Вы» и гарантия 2 предложений.
 */

import type { RecipeJson } from "../../recipeSchema.ts";

/** Максимальная длина description (1–2 предложения). */
export const DESCRIPTION_MAX_LENGTH = 150;

/** Максимальная длина chefAdvice (2–3 предложения, ориентир 220–520 символов). */
export const CHEF_ADVICE_MAX_LENGTH = 520;

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

/** Безопасные преимущества для fallback (без «хранить» и воды). */
const DESCRIPTION_ADVANTAGES = [
  "быстро готовится",
  "нежная текстура",
  "сытно",
  "легко разогреть",
  "минимум посуды",
  "ароматные специи",
  "простой состав",
  "приятная консистенция",
  "насыщенный вкус",
  "готовится в одной форме",
];

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

/** Универсальные fallback для description без названия блюда (pool-safe). */
const DESCRIPTION_POOL_FALLBACKS = [
  "Нежная текстура и понятный вкус; готовится быстро и без лишней посуды.",
  "Сочно и аккуратно держит форму; удобно готовить порциями.",
  "Мягкий вкус и ровная текстура; отлично получается даже без сложных техник.",
  "Приятная консистенция и насыщенный вкус; минимум посуды и времени.",
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

/** Fallback description без «хранить»: сочное блюдо + одно преимущество. */
const DESCRIPTION_FALLBACK_TEMPLATE = ": сочное и ароматное блюдо из духовки. Готовится в одной форме — минимум посуды.";

export function buildDescriptionFallback(options: {
  title: string;
  keyIngredient?: string;
  recipeIdSeed?: string;
}): string {
  const title = (options.title ?? "").trim() || "Блюдо";
  const key = (options.keyIngredient ?? "").trim() || "простые ингредиенты";
  const seed = (options.recipeIdSeed ?? title + key) || "default";
  const advantage = pickByHash(DESCRIPTION_ADVANTAGES, seed);
  const out = `${title}: ${key}. ${advantage}.`;
  if (out.length <= DESCRIPTION_MAX_LENGTH) return out;
  const short = `${title}${DESCRIPTION_FALLBACK_TEMPLATE}`;
  return short.length <= DESCRIPTION_MAX_LENGTH ? short : short.slice(0, DESCRIPTION_MAX_LENGTH - 1).trim() + ".";
}

/**
 * Приводит description к лимиту: обрезка по границе слова (не резать посередине), завершённое предложение;
 * убираем хвосты «Хранить»/«Можно хранить» и обрубки (окончание на «в», «и» и т.д.); при <60 — fallback.
 */
export function enforceDescription(
  desc: string | null | undefined,
  context?: { title?: string; keyIngredient?: string; recipeIdSeed?: string }
): string {
  let t = normalizeSpaces(desc ?? "");
  t = stripStorageTail(t);
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
    });
  }
  return t.slice(0, DESCRIPTION_MAX_LENGTH);
}

/** Запрещённые старты и штампы: при совпадении совет пересобирается из шаблона (не чиним заменой префикса). */
const CHEF_ADVICE_FORBIDDEN_STARTS = [
  /^для более\s/i,
  /^если хотите\s/i,
  /^чтобы сделать\s/i,
  /^подавайте\s/i,
  /^можно\s/i,
  /^рекомендуем\s/i,
  /^совет:\s/i,
  /^важно\s/i,
  /^вкус\s/i,
];

/** Кривой штамп — при наличии в тексте совет пересобирается целиком. */
const CHEF_ADVICE_BROKEN_PHRASE = /вкус\s+насыщенного\s+вкуса/i;

/** Проверяет, нужно ли пересобрать совет (запрещённый старт или штамп). */
export function hasForbiddenChefAdviceStart(text: string | null | undefined): boolean {
  const t = normalizeSpaces(text ?? "");
  if (!t.length) return false;
  if (CHEF_ADVICE_BROKEN_PHRASE.test(t)) return true;
  return CHEF_ADVICE_FORBIDDEN_STARTS.some((re) => re.test(t));
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

/** Шаблоны советов только с императивом в начале (Запекай, Смешай, Дай, Добавь, Сними, Нарежь и т.д.). */
const CHEF_ADVICE_CATEGORY_TEMPLATES: Record<string, string[]> = {
  temperature: [
    "Дай блюду 2–3 минуты постоять под крышкой — так сочность распределится.",
    "Сними с огня и остуди до тёплого перед подачей.",
    "Разогрей порцию на среднем огне, не пересушивая.",
  ],
  time: [
    "Запекай первые 15 минут при высокой температуре, затем убавь — появится корочка, внутри останется сок.",
    "Держи на огне ровно столько, сколько в рецепте — не переваривай.",
    "Сократи время на 2–3 минуты, если кусочки мельче.",
  ],
  texture: [
    "Нарежь овощи одинаково — так приготовятся одновременно и не разварятся.",
    "Слегка взбей перед подачей — текстура станет нежнее.",
    "Увари до нужной густоты на среднем огне, помешивая.",
  ],
  spices: [
    "Добавь зелень и специи в конце — аромат сохранится.",
    "Попробуй на соль перед подачей и скорректируй.",
    "Сбрызни лимоном или маслом перед подачей — вкус ярче.",
  ],
  serving: [
    "Подавай сразу после приготовления, пока не остыло.",
    "Дай постоять 1–2 минуты — соки распределятся.",
    "Разложи по тарелкам и сбрызни маслом.",
  ],
  storage: [
    "Остуди до комнатной температуры, затем убери в холодильник.",
    "Храни в закрытой посуде не более 2 дней; разогрей порцию перед едой.",
    "Не накрывай плотно при остывании — конденсат размочит корочку.",
  ],
};

const CHEF_ADVICE_CATEGORIES = Object.keys(CHEF_ADVICE_CATEGORY_TEMPLATES);

/** Шаблоны советов для пула: на «Вы», без упоминаний профиля/аллергий/детей/семьи. */
const POOL_SAFE_CHEF_ADVICE_TEMPLATES: string[] = [
  "Запекайте первые 15 минут при высокой температуре, затем убавьте огонь — так появится корочка, а внутри останется сок.",
  "Дайте блюду 2–3 минуты постоять под крышкой — сочность распределится равномерно.",
  "Нарежьте овощи одинаковыми кусочками — так они приготовятся одновременно и не разварятся.",
  "Добавьте зелень и специи в конце приготовления — аромат сохранится лучше.",
  "Остудите до комнатной температуры, затем уберите в холодильник. Это поможет сохранить текстуру.",
  "Снимите с огня и дайте постоять 1–2 минуты — соки распределятся. Это даст более сочную текстуру и ровный вкус.",
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
    t = normalizeSpaces(t + " Это даст более сочную текстуру и ровный вкус.").slice(0, CHEF_ADVICE_MAX_LENGTH);
  }
  return t;
}

/** Минимальная длина chefAdvice для добавления второго предложения. */
const CHEF_ADVICE_MIN_LENGTH_FOR_EXTRA = 220;

/** Добавляет второе предложение, если advice короче 220 символов (на «Вы», без запрещённых слов). */
function ensureChefAdviceMinLength(advice: string): string {
  if (advice.length >= CHEF_ADVICE_MIN_LENGTH_FOR_EXTRA && countSentences(advice) >= 2) return advice;
  if (countSentences(advice) < 2) {
    const suffix = " Это помогает удержать сочность и сделать текстуру более нежной.";
    return normalizeSpaces(advice.trim() + suffix).slice(0, CHEF_ADVICE_MAX_LENGTH);
  }
  return advice.slice(0, CHEF_ADVICE_MAX_LENGTH);
}

/** Детерминированный fallback для chefAdvice по recipeIdSeed (без рандома). */
export function buildChefAdviceFallback(options: {
  title?: string;
  ingredients?: string[];
  steps?: string[];
  recipeIdSeed?: string;
}): string {
  const seed = (options.recipeIdSeed ?? (options.title ?? "") + (options.ingredients?.[0] ?? "") + (options.steps?.[0] ?? "")).trim() || "default";
  const catIdx = simpleHash(seed) % CHEF_ADVICE_CATEGORIES.length;
  const category = CHEF_ADVICE_CATEGORIES[catIdx] ?? "storage";
  const templates = CHEF_ADVICE_CATEGORY_TEMPLATES[category] ?? CHEF_ADVICE_CATEGORY_TEMPLATES.storage;
  const templateIdx = simpleHash(seed + "t") % templates.length;
  const line = templates[templateIdx] ?? templates[0];
  return normalizeSpaces(line).slice(0, CHEF_ADVICE_MAX_LENGTH);
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

/** Добавляет второе предложение, если только одно (без LLM). */
function ensureTwoSentences(advice: string): string {
  if (countSentences(advice) >= 2) return advice;
  const suffix = " Это поможет сохранить вкус и текстуру.";
  return normalizeSpaces(advice.trim() + suffix).slice(0, CHEF_ADVICE_MAX_LENGTH);
}

/**
 * Приводит chefAdvice к лимиту. При запрещённом старте или «Вкус насыщенного вкуса» — пересобираем из шаблона.
 * При «ты»-обращении — переписываем на «Вы» и гарантируем 2 предложения.
 * Анти-обрыв: если не заканчивается на .!?… — обрезаем до последнего предложения и добавляем закрывающее.
 * Если длина < 220 или одно предложение — добавляем второе (на «Вы»).
 */
export function enforceChefAdvice(
  advice: string | null | undefined,
  context?: { title?: string; ingredients?: string[]; steps?: string[]; cookingTimeMinutes?: number; recipeIdSeed?: string }
): string {
  let t = normalizeSpaces(advice ?? "");
  const seed = (context?.recipeIdSeed ?? (context?.title ?? "") + (context?.ingredients?.[0] ?? "") + (context?.steps?.[0] ?? "")).trim() || "default";

  t = fixChefAdviceTruncation(t);

  if (CHEF_ADVICE_TY_PATTERN.test(t)) {
    t = rewriteChefAdviceTyToVy(t);
    t = ensureTwoSentences(t);
    if (t.length > CHEF_ADVICE_MAX_LENGTH) {
      t = truncateAtSentenceBoundary(t, CHEF_ADVICE_MAX_LENGTH);
    }
    t = ensureChefAdviceMinLength(t);
    return t.slice(0, CHEF_ADVICE_MAX_LENGTH);
  }

  if (hasForbiddenChefAdviceStart(t)) {
    t = buildChefAdviceFallback({
      title: context?.title,
      ingredients: context?.ingredients,
      steps: context?.steps,
      recipeIdSeed: seed,
    });
    if (CHEF_ADVICE_TY_PATTERN.test(t)) t = rewriteChefAdviceTyToVy(t);
  } else if (t.length > CHEF_ADVICE_MAX_LENGTH) {
    t = truncateAtSentenceBoundary(t, CHEF_ADVICE_MAX_LENGTH);
  }
  if (t.length < 30 || isGenericChefAdvice(t)) {
    t = buildChefAdviceFallback({
      title: context?.title,
      ingredients: context?.ingredients,
      steps: context?.steps,
      recipeIdSeed: seed,
    });
    if (CHEF_ADVICE_TY_PATTERN.test(t)) t = rewriteChefAdviceTyToVy(t);
  }
  t = ensureChefAdviceMinLength(t);
  return t.slice(0, CHEF_ADVICE_MAX_LENGTH);
}

/** Один короткий вызов LLM для исправления только description (если обрыв). */
export async function repairDescriptionOnly(current: string, apiKey: string): Promise<string | null> {
  const sys = "Ты исправляешь только поле description. Верни ТОЛЬКО валидный JSON: {\"description\": \"...\"}. 1–2 предложения, макс. 150 символов, без обрыва, без троеточий. Суть блюда + одно преимущество.";
  const user = `Текущее описание (обрывается): «${current.slice(0, 200)}». Допиши до 1–2 законченных предложений, не более 150 символов.`;
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
