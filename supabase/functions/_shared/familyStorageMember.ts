/**
 * Выбор member_id для хранения данных в режиме «Семья» (общий стол).
 * Используется в generate-plan и deepseek-chat, чтобы не писать null в таблицы,
 * а привязывать к одному выбранному члену семьи (старший >= 12 мес).
 */

export type MemberWithAgeMonths = {
  id?: string;
  age_months?: number | null;
  [k: string]: unknown;
};

/**
 * Выбирает member_id для хранения при режиме «Семья».
 * - candidates = члены с age_months == null или age_months >= 12
 * - из candidates берём самого старшего (max age_months)
 * - если candidates пуст — fallback на первого из members
 * - если members пуст — null
 */
export function pickFamilyStorageMemberId(members: MemberWithAgeMonths[]): string | null {
  if (!members || members.length === 0) return null;
  const withId = members.filter((m) => m.id != null && typeof m.id === "string") as Array<MemberWithAgeMonths & { id: string }>;
  if (withId.length === 0) return null;

  const candidates = withId.filter(
    (m) => m.age_months == null || (Number.isFinite(m.age_months) && (m.age_months as number) >= 12)
  );
  const pool = candidates.length > 0 ? candidates : withId;

  let best = pool[0];
  for (let i = 1; i < pool.length; i++) {
    const a = best.age_months ?? 0;
    const b = pool[i].age_months ?? 0;
    if (b > a) best = pool[i];
  }
  return (best as { id: string }).id;
}
