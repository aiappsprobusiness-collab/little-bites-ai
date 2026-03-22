export type PlanModeHintMode = "family" | "member";

const listClass = "mt-1.5 list-disc pl-4 [&>li]:mb-0.5 text-sm text-popover-foreground";

function formatAge(ageMonths: number | null | undefined): string {
  if (ageMonths == null || !Number.isFinite(ageMonths)) return "—";
  if (ageMonths < 12) return `${ageMonths} мес`;
  const years = Math.floor(ageMonths / 12);
  return `${years} ${years === 1 ? "год" : years < 5 ? "года" : "лет"}`;
}

function formatList(items: string[] | undefined): string {
  if (!items?.length) return "—";
  return items.join(", ");
}

export interface PlanProfileHelpBodyProps {
  mode: PlanModeHintMode;
  /** Данные профиля для режима "member". */
  memberAgeMonths?: number | null;
  memberAllergies?: string[];
  memberLikes?: string[];
  memberDislikes?: string[];
  className?: string;
}

/**
 * Текст справки «как учитывается профиль» — показывается из меню «Ещё» на вкладке План (не в hero).
 */
export function PlanProfileHelpBody({
  mode,
  memberAgeMonths,
  memberAllergies,
  memberLikes,
  memberDislikes,
  className,
}: PlanProfileHelpBodyProps) {
  if (mode === "family") {
    return (
      <div className={className}>
        <p className="text-sm text-foreground">В семейном режиме мы учитываем:</p>
        <ul className={listClass}>
          <li>дети до 12 месяцев не участвуют в семейном меню</li>
          <li>для детей 1–3 лет подбираем более мягкие блюда</li>
          <li>все особенности членов семьи (аллергии, любит, не любит)</li>
        </ul>
      </div>
    );
  }

  return (
    <div className={className}>
      <p className="text-sm text-foreground">Для выбранного профиля учитываем:</p>
      <ul className={listClass}>
        <li>Возраст: {formatAge(memberAgeMonths)}</li>
        <li>Аллергия: {formatList(memberAllergies)}</li>
        <li>Любит: {formatList(memberLikes)}</li>
        <li>Не любит: {formatList(memberDislikes)}</li>
      </ul>
    </div>
  );
}
