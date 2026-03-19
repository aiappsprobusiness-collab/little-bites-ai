import { HelpCircle, Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type PlanModeHintMode = "family" | "member";

const FAMILY_TEXT = "✨ Умное меню: учитываем возраст и особенности вашей семьи";
const FAMILY_SUBTEXT = "Без лишних настроек — всё работает автоматически";
const MEMBER_TEXT = "Учитываем все особенности профиля";

export interface PlanModeHintProps {
  mode: PlanModeHintMode;
  className?: string;
  /** Данные профиля для режима "member" (отображаются в тултипе). */
  memberAgeMonths?: number | null;
  memberAllergies?: string[];
  memberLikes?: string[];
  memberDislikes?: string[];
}

const tooltipContentClass = "max-w-[260px] rounded-md px-3 py-1.5 text-xs leading-snug text-popover-foreground";
const listClass = "mt-1.5 list-disc pl-4 [&>li]:mb-0.5";

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

/** Подсказка в hero-блоке Плана: короткий текст и лёгкий popover/tooltip. */
export function PlanModeHint({ mode, className, memberAgeMonths, memberAllergies, memberLikes, memberDislikes }: PlanModeHintProps) {
  if (mode === "family") {
    return (
      <div className={cn("mt-1 w-full min-w-0", className)}>
        <div className="flex items-start gap-2 w-full min-w-0" role="status">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-foreground/85 leading-snug w-full whitespace-normal break-words">{FAMILY_TEXT}</p>
            <p className="text-xs text-muted-foreground opacity-70 mt-1.5 leading-snug w-full whitespace-normal break-words">
              {FAMILY_SUBTEXT}
            </p>
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center justify-center h-5 min-w-5 shrink-0 self-start mt-0.5 rounded-full px-1 text-muted-foreground hover:text-foreground hover:bg-muted/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors"
                aria-label="Подробнее о семейном режиме"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent side="bottom" align="start" className={tooltipContentClass}>
              <p>Мы учитываем:</p>
              <ul className={listClass}>
                <li>дети до 12 месяцев не участвуют в семейном меню</li>
                <li>для детей 1–3 лет подбираем более мягкие блюда</li>
                <li>все особенности членов семьи (аллергии, любит, не любит)</li>
              </ul>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("mt-1 w-full min-w-0", className)}>
      <div className="flex items-start gap-2 w-full min-w-0" role="status">
        <p className="text-xs text-muted-foreground leading-snug flex-1 min-w-0 w-full whitespace-normal break-words">{MEMBER_TEXT}</p>
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center justify-center w-5 h-5 shrink-0 self-start mt-0.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors"
              aria-label="Подробнее об особенностях профиля"
            >
              <HelpCircle className="w-4 h-4 shrink-0" strokeWidth={2} />
            </button>
          </PopoverTrigger>
          <PopoverContent side="bottom" align="start" className={tooltipContentClass}>
            <p>Мы учитываем:</p>
            <ul className={listClass}>
              <li>Возраст: {formatAge(memberAgeMonths)}</li>
              <li>Аллергия: {formatList(memberAllergies)}</li>
              <li>Любит: {formatList(memberLikes)}</li>
              <li>Не любит: {formatList(memberDislikes)}</li>
            </ul>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
