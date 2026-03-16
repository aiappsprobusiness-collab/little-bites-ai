/**
 * Stage 2.3: anti-context-leak guard для pool-safe текста рецепта.
 * Не допускаем попадания в сохраняемый рецепт фраз, привязанных к запросу пользователя (в дорогу, с собой и т.д.).
 */

/** Фразы, которые не должны попадать в pool (request-specific context). */
const REQUEST_CONTEXT_PHRASES: string[] = [
  "в дорогу",
  "с собой",
  "в контейнер",
  "если берёте с собой",
  "удобно взять с собой",
  "в школу",
  "в поездку",
  "для дороги",
  "подойдёт в контейнер",
  "удобно в дорогу",
  "для ребёнка",
  "для ребенка",
  "для всей семьи",
];

function normalizeForMatch(s: string): string {
  return (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function containsLeakPhrase(text: string): boolean {
  const t = normalizeForMatch(text);
  return REQUEST_CONTEXT_PHRASES.some((phrase) => t.includes(phrase.toLowerCase()));
}

/** Stage 2.4: проверка одного текста на request-context leakage (для isDescriptionInvalid и др.). */
export function textContainsRequestContextLeak(text: string): boolean {
  const t = (text ?? "").trim();
  return t.length > 0 && containsLeakPhrase(t);
}

const STEP_LEAK_FALLBACK = "Готово к подаче.";

/** Stage 2.4.1: очистка одного шага от leakage-фраз без LLM. Удаляет фразы; если после очистки шаг пустой или слишком короткий — подставляет нейтральную фразу. */
export function cleanStepFromRequestContextLeak(step: string): string {
  const t = (step ?? "").trim();
  if (!t.length) return STEP_LEAK_FALLBACK;
  if (!containsLeakPhrase(t)) return t;
  let out = t;
  for (const phrase of REQUEST_CONTEXT_PHRASES) {
    if (normalizeForMatch(out).includes(phrase.toLowerCase())) {
      out = removePhrase(out, phrase);
    }
  }
  out = out.replace(/\s*,\s*$/g, "").replace(/^\s*,\s*/, "").replace(/\s+/g, " ").trim();
  if (out.length < 8) return STEP_LEAK_FALLBACK;
  if (!/[.!?]$/.test(out)) out = out.replace(/\s*[,—:]\s*$/, "") + ".";
  return out;
}

/** Удаляет одну фразу из текста (первое вхождение), освобождает двойные пробелы и запятые. */
function removePhrase(text: string, phrase: string): string {
  const re = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  return text
    .replace(re, " ")
    .replace(/\s*,\s*,/g, ",")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*$/g, "")
    .replace(/^\s*,\s*/, "")
    .trim();
}

export interface RequestContextLeakResult {
  triggered: boolean;
  leakFields: ("title" | "description" | "chef_advice")[];
  suggestedTitle?: string;
  /** true — вызывающий должен пересобрать description через composer. */
  descriptionUseComposer: boolean;
  /** true — вызывающий должен подставить fallback для chef_advice. */
  chefAdviceUseFallback: boolean;
}

/**
 * Проверяет title, description, chef_advice на request-context leakage.
 * Возвращает флаги и suggestedTitle для безопасной правки без LLM.
 */
export function checkRequestContextLeak(
  title: string,
  description: string,
  chefAdvice: string
): RequestContextLeakResult {
  const leakFields: ("title" | "description" | "chef_advice")[] = [];
  let suggestedTitle: string | undefined;
  let descriptionUseComposer = false;
  let chefAdviceUseFallback = false;

  const tTitle = (title ?? "").trim();
  if (tTitle && containsLeakPhrase(tTitle)) {
    leakFields.push("title");
    let out = tTitle;
    for (const phrase of REQUEST_CONTEXT_PHRASES) {
      if (normalizeForMatch(out).includes(phrase.toLowerCase())) {
        out = removePhrase(out, phrase);
      }
    }
    if (out.length >= 2) suggestedTitle = out.replace(/\s+/g, " ").trim();
  }

  if ((description ?? "").trim() && containsLeakPhrase(description)) {
    leakFields.push("description");
    descriptionUseComposer = true;
  }

  if ((chefAdvice ?? "").trim() && containsLeakPhrase(chefAdvice)) {
    leakFields.push("chef_advice");
    chefAdviceUseFallback = true;
  }

  return {
    triggered: leakFields.length > 0,
    leakFields,
    ...(suggestedTitle ? { suggestedTitle } : {}),
    descriptionUseComposer,
    chefAdviceUseFallback,
  };
}
