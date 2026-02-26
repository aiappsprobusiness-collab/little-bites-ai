/**
 * Follow-up после blocked: короткий ответ пользователя трактуем как "то же блюдо с заменой".
 * Возвращает rewrittenQuery для отправки в Edge вместо исходного текста, или null.
 */

import type { BlockedMeta } from "@/types/chatBlocked";

const FOLLOW_UP_MAX_AGE_MS = 10 * 60 * 1000; // 10 минут
const SHORT_CLARIFICATION_MAX_LEN = 40;

/** Паттерны "вариант с X" / "давай с X" / "замени на X" */
const FOLLOW_UP_PATTERNS = [
  /вариант\s+с\s+(.+)/i,
  /давай\s+с\s+(.+)/i,
  /давай\s+(.+)/i,
  /замени\s+на\s+(.+)/i,
  /можно\s+с\s+(.+)/i,
  /сделай\s+с\s+(.+)/i,
  /предложи\s+с\s+(.+)/i,
];

/** Слова, явно указывающие на новое блюдо — не переписываем. */
const NEW_DISH_HINTS = [
  "суп", "борщ", "оладьи", "омлет", "каша", "завтрак", "обед", "ужин",
  "перекус", "салат", "рагу", "плов", "паста", "пицца", "блины",
  "сырники", "творожник", "запеканка", "котлеты", "тефтели",
];

function extractReplacement(userText: string): string | null {
  const t = userText.trim();
  if (!t) return null;
  for (const re of FOLLOW_UP_PATTERNS) {
    const m = t.match(re);
    if (m && m[1]) return m[1].trim();
  }
  return t;
}

function looksLikeNewDish(userText: string): boolean {
  const lower = userText.trim().toLowerCase();
  if (lower.length > SHORT_CLARIFICATION_MAX_LEN) return true;
  return NEW_DISH_HINTS.some((hint) => lower.includes(hint));
}

function alternativeMatches(alternative: string, replacement: string): boolean {
  const a = alternative.trim().toLowerCase();
  const r = replacement.trim().toLowerCase();
  return a.includes(r) || r.includes(a);
}

/** Убирает из запроса слова, содержащие blocked item или его основу (для intended_dish_hint без аллергена). */
export function deriveDishHint(originalQuery: string, blockedItems: string[]): string {
  let s = (originalQuery ?? "").trim();
  if (!s) return "";
  const words = s.split(/\s+/);
  const filtered = words.filter((w) => {
    const wl = w.toLowerCase();
    for (const blocked of blockedItems) {
      const b = (blocked ?? "").toLowerCase();
      if (!b) continue;
      if (wl.includes(b) || b.includes(wl)) return false;
      const stem = b.length >= 4 ? b.slice(0, -1) : b;
      if (stem.length >= 3 && wl.includes(stem)) return false;
    }
    return true;
  });
  const result = filtered.join(" ").trim();
  return result || originalQuery.trim();
}

export interface FollowUpRewriteParams {
  lastAssistantMeta: BlockedMeta | null | undefined;
  lastAssistantTimestamp: Date | number | string;
  userText: string;
  now?: Date;
}

/**
 * Если последнее сообщение ассистента — blocked с meta и не старше 10 минут,
 * и пользователь написал короткое уточнение (вариант с бананом / давай банан),
 * возвращает rewrittenQuery для того же блюда с заменой. Иначе null.
 */
export function getRewrittenQueryIfFollowUp(params: FollowUpRewriteParams): string | null {
  const {
    lastAssistantMeta,
    lastAssistantTimestamp,
    userText,
    now = new Date(),
  } = params;

  if (!lastAssistantMeta || lastAssistantMeta.blocked !== true) return null;
  const created = typeof lastAssistantTimestamp === "number" || lastAssistantTimestamp instanceof Date
    ? new Date(lastAssistantTimestamp).getTime()
    : new Date(String(lastAssistantTimestamp)).getTime();
  if (now.getTime() - created > FOLLOW_UP_MAX_AGE_MS) return null;

  const replacement = extractReplacement(userText);
  if (!replacement) return null;
  if (looksLikeNewDish(userText)) return null;

  const alts = lastAssistantMeta.suggested_alternatives ?? [];
  const blocked = lastAssistantMeta.blocked_items ?? [];
  const original = lastAssistantMeta.original_query ?? "";
  const dishHint = lastAssistantMeta.intended_dish_hint ?? original;

  const matchesAlternative = alts.some((a) => alternativeMatches(a, replacement));
  if (!matchesAlternative && userText.length > SHORT_CLARIFICATION_MAX_LEN) return null;
  if (!matchesAlternative && alts.length > 0) return null;

  // Не включаем blocked_items в текст — иначе проверка аллергии снова сработает на "ягоды"/"ягод".
  return `${dishHint} с ${replacement}`;
}
