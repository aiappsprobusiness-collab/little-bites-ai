import { HintBadge } from "@/components/ui/HintBadge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type PlanModeHintMode = "family" | "member";

const FAMILY_TEXT = "👨‍👩‍👧 Подбираем блюда для всей семьи";
const MEMBER_TEXT = "Учитываем предпочтения и аллергии профиля";
const MEMBER_TOOLTIP = "Ограничения профиля применяются при подборе рецептов.";

export interface PlanModeHintProps {
  mode: PlanModeHintMode;
  className?: string;
}

/** Подсказка в hero-блоке Плана: короткий текст и лёгкий popover/tooltip. */
export function PlanModeHint({ mode, className }: PlanModeHintProps) {
  if (mode === "family") {
    return (
      <div className={cn("mt-1.5 max-w-md", className)}>
        <div className="inline-flex items-center gap-1.5" role="status">
          <span className="text-xs text-muted-foreground leading-snug">{FAMILY_TEXT}</span>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center justify-center h-5 min-w-5 rounded-full px-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors"
                aria-label="Подробнее о семейном режиме"
              >
                ⓘ
              </button>
            </PopoverTrigger>
            <PopoverContent side="bottom" align="start" className="w-72 max-w-[calc(100vw-2rem)] rounded-2xl p-3 text-sm leading-5">
              <p>Мы учитываем возраст детей:</p>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                <li>дети до 12 месяцев не участвуют в семейном меню</li>
                <li>для детей 1–3 лет подбираем более мягкие блюда</li>
              </ul>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("mt-1.5 max-w-md", className)}>
      <HintBadge text={MEMBER_TEXT} tooltip={MEMBER_TOOLTIP} />
    </div>
  );
}
