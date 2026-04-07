/**
 * Целевое число порций для генерации рецепта в чате (deepseek-chat).
 * Согласовано с UX плана: не «1 порция» для семьи/взрослых без явного запроса.
 */
const MIN_S = 1;
const MAX_S = 8;

function normalizeMealType(mt: string | null | undefined): string {
  const x = String(mt ?? "").trim().toLowerCase();
  if (x === "breakfast" || x === "lunch" || x === "dinner" || x === "snack") return x;
  return "";
}

type MemberLike = { age_months?: number | null; type?: string | null };

/** Участники «общего стола» для порций: как в family prompt — без детей &lt; 12 мес. */
function countFamilyEaters(members: MemberLike[]): number {
  let n = 0;
  for (const m of members) {
    const amRaw = m.age_months;
    const am = amRaw != null && Number.isFinite(Number(amRaw)) ? Math.max(0, Math.round(Number(amRaw))) : null;
    const t = String(m.type ?? "").toLowerCase();
    if (am != null && am < 12) continue;
    if (t === "adult" || (am != null && am >= 216)) {
      n += 1;
      continue;
    }
    if (am != null && am >= 12) {
      n += 1;
      continue;
    }
    if (t === "child") n += 1;
  }
  return n;
}

function baseServingsFromEaterCount(eaters: number): number {
  if (eaters <= 0) return 1;
  if (eaters === 1) return 2;
  if (eaters === 2) return 4;
  return Math.min(MAX_S, eaters * 2);
}

function mealMultiplier(mealType: string): number {
  if (mealType === "snack") return 0.65;
  if (mealType === "lunch") return 1.05;
  return 1;
}

/**
 * @param targetIsFamily — режим «Семья» в запросе чата
 * @param members — все члены семьи (для family); для single можно передать один элемент
 * @param mealType — breakfast | lunch | dinner | snack (опционально)
 */
export function resolveChatRecipeServings(params: {
  targetIsFamily: boolean;
  members: MemberLike[];
  mealType?: string | null;
}): number {
  const mt = normalizeMealType(params.mealType);
  const mult = mealMultiplier(mt);

  if (params.targetIsFamily && params.members.length > 0) {
    const eaters = countFamilyEaters(params.members);
    const base = baseServingsFromEaterCount(eaters);
    const scaled = Math.round(base * mult);
    return Math.min(MAX_S, Math.max(MIN_S, scaled));
  }

  const one = params.members[0];
  if (!one) return Math.min(MAX_S, Math.max(2, Math.round(2 * mult)));

  const amRaw = one.age_months;
  const am = amRaw != null && Number.isFinite(Number(amRaw)) ? Math.max(0, Math.round(Number(amRaw))) : null;
  if (am != null && am < 12) {
    return Math.min(MAX_S, Math.max(MIN_S, Math.round(1 * mult)));
  }
  const base = 2;
  const scaled = Math.round(base * mult);
  return Math.min(MAX_S, Math.max(MIN_S, scaled));
}
