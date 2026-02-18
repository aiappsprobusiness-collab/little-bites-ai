import { ReactNode } from "react";
import { LifeBuoy, MessageCircle } from "lucide-react";
import { HelpSectionCard, HelpHeader, HelpPrimaryCTA } from "@/components/help-ui";

export interface SosHeroProps {
  /** Имя ребёнка/члена семьи (для ссылки «Как сегодня себя чувствует …?») */
  memberName?: string | null;
  onAskQuestion: () => void;
  onSecondaryQuestion?: () => void;
  /** Pill-кнопка выбора профиля (рядом с заголовком). Один селектор на экране. */
  profileSelector?: ReactNode;
}

export function SosHero({
  memberName,
  onAskQuestion,
  onSecondaryQuestion,
  profileSelector,
}: SosHeroProps) {
  const handleAsk = () => onAskQuestion();
  const handleSecondary = () => onSecondaryQuestion?.();

  return (
    <HelpSectionCard>
      <div className="flex items-start gap-3">
        <div
          className="flex items-center justify-center shrink-0 w-9 h-9 rounded-full bg-primary/10 text-primary"
          aria-hidden
        >
          <LifeBuoy className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <HelpHeader
            title="Помощник рядом"
            subtitle="Отвечу про питание, реакции, режим и самочувствие ребёнка."
            rightSlot={profileSelector}
          />
          <div className="flex flex-col gap-2 mt-3">
            <HelpPrimaryCTA onClick={handleAsk}>Задать вопрос</HelpPrimaryCTA>
            {memberName && (
              <button
                type="button"
                onClick={handleSecondary}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground text-left w-fit py-0.5 -ml-0.5 rounded-md border border-transparent hover:border-primary/20 hover:bg-primary/[0.06] transition-colors"
              >
                <MessageCircle className="w-3.5 h-3.5 shrink-0 opacity-70" aria-hidden />
                Как сегодня себя чувствует {memberName}?
              </button>
            )}
          </div>
        </div>
      </div>
    </HelpSectionCard>
  );
}
