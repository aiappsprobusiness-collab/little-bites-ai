import { HintBadge } from "@/components/ui/HintBadge";
import { cn } from "@/lib/utils";

export type PlanModeHintMode = "family" | "member";

const FAMILY_TEXT = "Семья: блюда для общего стола";
const FAMILY_TOOLTIP = "Для малышей до 1 года питание обычно подбирают отдельно.";
const MEMBER_TEXT = "Учитываем предпочтения и аллергии профиля";
const MEMBER_TOOLTIP = "Ограничения профиля применяются при подборе рецептов.";

export interface PlanModeHintProps {
  mode: PlanModeHintMode;
  className?: string;
}

/**
 * Подсказка в hero-блоке Плана: текст + «?» + tooltip.
 * Без bottom sheet — только tooltip.
 */
export function PlanModeHint({ mode, className }: PlanModeHintProps) {
  const text = mode === "family" ? FAMILY_TEXT : MEMBER_TEXT;
  const tooltip = mode === "family" ? FAMILY_TOOLTIP : MEMBER_TOOLTIP;

  return (
    <div className={cn("mt-1.5 max-w-md", className)}>
      <HintBadge text={text} tooltip={tooltip} />
    </div>
  );
}
