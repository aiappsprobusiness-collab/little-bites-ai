/**
 * Quality gate для chef_advice: краткий практический совет или null (без заглушек).
 */

export const CHEF_ADVICE_MAX_LENGTH = 220;

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

/** Диагностика: логи только при CHEF_ADVICE_DEBUG=true */
export function isChefAdviceDebugEnabled(): boolean {
  const v = (globalThis as { Deno?: { env?: { get?: (k: string) => string | undefined } } }).Deno?.env?.get?.(
    "CHEF_ADVICE_DEBUG",
  );
  return v === "1" || v === "true" || v === "TRUE";
}

/** Убираем восклицания, лишние пробелы, пафосные двоеточия после одного слова в начале. */
export function normalizeChefAdviceText(raw: string): string {
  let t = norm(raw);
  if (!t.length) return "";
  t = t.replace(/!/g, ".");
  t = t.replace(/^([а-яёa-z]{2,20})\s*:\s+/i, "$1, ");
  t = t.replace(/\s+\.{2,}/g, ".");
  while (t.includes("..")) {
    t = t.replace(/\.\./g, ".");
  }
  const sentences = splitSentencesRu(t);
  const deduped: string[] = [];
  for (const s of sentences) {
    const x = norm(s);
    if (!x.length) continue;
    const key = x.toLowerCase();
    if (deduped.some((d) => d.toLowerCase() === key)) continue;
    deduped.push(x.endsWith(".") || x.endsWith("?") ? x : x + ".");
  }
  let out = deduped.slice(0, 2).join(" ");
  out = norm(out.replace(/\s*\.\s*\./g, "."));
  if (out && !/[.?!…]$/.test(out)) {
    out = out.replace(/[,;:—-]+\s*$/, "").trim();
    out = out ? out + "." : "";
  }
  if (out.length > CHEF_ADVICE_MAX_LENGTH) {
    out = truncateAtSentenceBoundary(out, CHEF_ADVICE_MAX_LENGTH);
    if (out.length > CHEF_ADVICE_MAX_LENGTH) {
      out = norm(out.slice(0, CHEF_ADVICE_MAX_LENGTH).replace(/\s+\S*$/, "")) + ".";
    }
  }
  return norm(out);
}

function splitSentencesRu(text: string): string[] {
  const t = norm(text);
  if (!t.length) return [];
  const parts = t.split(/(?<=[.!?…])\s+/);
  return parts.map((p) => norm(p)).filter(Boolean);
}

function truncateAtSentenceBoundary(text: string, maxLen: number): string {
  const t = norm(text);
  if (t.length <= maxLen) return t;
  const slice = t.slice(0, maxLen + 1);
  const lastSentenceEnd = Math.max(
    slice.lastIndexOf("."),
    slice.lastIndexOf("!"),
    slice.lastIndexOf("?"),
    slice.lastIndexOf("…"),
  );
  if (lastSentenceEnd > 20) {
    return slice.slice(0, lastSentenceEnd + 1).trim();
  }
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace > 0) {
    return slice.slice(0, lastSpace).trim() + ".";
  }
  return t.slice(0, maxLen).trim() + ".";
}

/** Известные низкоценные шаблоны (подстроки / regex). */
const LOW_VALUE_SUBSTRINGS = [
  "подавайте сразу",
  "пока блюдо тёплое",
  "пока блюдо теплое",
  "чтобы осталось сочн",
  "добавьте специи по вкусу",
  "специи по вкусу",
  "украсьте зеленью",
  "украсить зеленью",
  "используйте свежие продукты",
  "свежие продукты",
  "свежие ингредиенты",
  "для аромата добавьте специи",
  "добавьте зелень в конце",
  "зелень в конце",
  "это поможет сохранить вкус и текстуру",
  "идеально для семейного",
  "подойдёт на любой случай",
  "можно подать с хлебом",
  "разогрейте перед подачей",
  "храните в холодильнике",
];

const LOW_VALUE_REGEX = [
  /подавайте\s+горячим/i,
  /подавайте\s+тёплым\s*\.?\s*$/i,
  /подавайте\s+теплым\s*\.?\s*$/i,
  /^не\s+переваривайте/i,
  /^не\s+пересушивайте/i,
  /приятного\s+аппетита/i,
];

/** Слишком общие начала целой фразы. */
const GENERIC_START_REGEX = [
  /^попробуйте\s+и\s+скорректируйте/i,
  /^соль\s+и\s+специи\s+по\s+вкусу/i,
  /^добавьте\s+соль\s+по\s+вкусу/i,
];

function wordTokens(text: string, minLen: number): string[] {
  return norm(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= minLen);
}

/** Пересечение с названием/ингредиентами — слабая привязка к рецепту. */
function hasRecipeAnchoring(advice: string, title: string, ingredientNames: string[]): boolean {
  const adv = advice.toLowerCase();
  const titleWords = wordTokens(title, 4);
  for (const w of titleWords) {
    if (adv.includes(w)) return true;
  }
  for (const ing of ingredientNames.slice(0, 6)) {
    for (const w of wordTokens(ing, 4)) {
      if (w.length >= 4 && adv.includes(w)) return true;
    }
  }
  return false;
}

function hasConcreteCue(advice: string): boolean {
  const t = advice.toLowerCase();
  if (/\d+\s*°|\d+\s*градус|210|200|180|160|°c|℃/i.test(t)) return true;
  if (/\d+\s*–\s*\d+\s*мин|\d+\s*минут|\d+\s*мин\b|\d+\s*сек/i.test(t)) return true;
  if (/\b\d{1,2}\s*:\s*\d{2}\b/.test(t)) return false;
  const cues =
    /обжар|запек|туш|варк|блендер|взбив|взбейте|температур|огн|духовк|сковород|кипен|бульон|корочк|тесто\s+на|фарш|творог|рис\s|гречк|кабач|тыкв|брокколи|фрикадел|котлет|сметан|сливк|крахмал|желатин|марин|насто|остуд|остыть|перемеш|вмеш|в конце заклад|до золотист|под крышк|сняти(е|я)\s+с\s+огня|убавьте|умеренн/i;
  return cues.test(t);
}

function isMostlyGenericWording(advice: string): boolean {
  const t = advice.toLowerCase();
  const filler =
    /\b(можно|лучше|чтобы|чуть|слегка|немного|всегда|обычно|иногда|просто|просто\s+так|приятно|вкусно|аромат)\b/g;
  const without = t.replace(filler, " ");
  const letters = (without.match(/[а-яёa-z]/gi) ?? []).length;
  const total = (t.match(/[а-яёa-z]/gi) ?? []).length;
  if (total < 15) return true;
  return letters < total * 0.45;
}

export type ChefAdviceLowValueResult = { lowValue: true; reason: string } | { lowValue: false };

/**
 * true = совет не сохраняем (слишком общий, шаблон, пустой смысл).
 */
export function isChefAdviceLowValue(
  advice: string,
  ctx?: { title?: string; ingredientNames?: string[]; stepTexts?: string[] },
): ChefAdviceLowValueResult {
  const t = norm(advice);
  if (!t.length) return { lowValue: true, reason: "empty" };
  if (t.length < 28) return { lowValue: true, reason: "too_short" };
  if (t.length > CHEF_ADVICE_MAX_LENGTH) return { lowValue: true, reason: "too_long_after_norm" };

  const sents = splitSentencesRu(t);
  if (sents.length === 0) return { lowValue: true, reason: "no_sentence" };
  if (sents.length > 2) return { lowValue: true, reason: "too_many_sentences" };

  const lower = t.toLowerCase();
  const title = ctx?.title ?? "";
  const ings = ctx?.ingredientNames ?? [];
  const anchoredEarly = hasRecipeAnchoring(t, title, ings);
  const concreteEarly = hasConcreteCue(t);

  if (/\bне\s+пережаривай(те)?\b/i.test(t) || /\bне\s+переваривай(те)?\b/i.test(t)) {
    if (t.length < 88 || (!anchoredEarly && !concreteEarly)) {
      return { lowValue: true, reason: "generic_overcook_warning" };
    }
  }

  for (const sub of LOW_VALUE_SUBSTRINGS) {
    if (lower.includes(sub)) {
      return { lowValue: true, reason: `generic_substring:${sub.slice(0, 40)}` };
    }
  }
  for (const re of LOW_VALUE_REGEX) {
    if (re.test(t)) {
      return { lowValue: true, reason: `generic_regex:${re.source.slice(0, 40)}` };
    }
  }
  for (const re of GENERIC_START_REGEX) {
    if (re.test(t)) {
      return { lowValue: true, reason: `generic_start:${re.source.slice(0, 40)}` };
    }
  }

  if (isMostlyGenericWording(t)) {
    return { lowValue: true, reason: "mostly_filler_words" };
  }

  const steps = ctx?.stepTexts ?? [];
  const anchored = anchoredEarly;
  const concrete = concreteEarly;
  if (!anchored && !concrete) {
    return { lowValue: true, reason: "no_recipe_anchor_no_concrete_cue" };
  }

  const stepJoined = steps.join(" ").toLowerCase();
  if (stepJoined.length > 20) {
    const compact = lower.replace(/\s+/g, " ");
    let maxOverlap = 0;
    for (const st of steps) {
      const sc = norm(st).toLowerCase().replace(/\s+/g, " ");
      if (sc.length < 25) continue;
      if (compact.includes(sc.slice(0, Math.min(60, sc.length)))) {
        maxOverlap = Math.max(maxOverlap, Math.min(60, sc.length));
      }
    }
    if (maxOverlap > 0 && compact.length <= maxOverlap + 25) {
      return { lowValue: true, reason: "paraphrases_steps" };
    }
  }

  return { lowValue: false };
}
