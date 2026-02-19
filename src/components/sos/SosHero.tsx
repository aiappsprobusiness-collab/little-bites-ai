import { ReactNode } from "react";
import { LifeBuoy, MessageCircle } from "lucide-react";
import { HelpHeader, HelpPrimaryCTA } from "@/components/help-ui";

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
    <div className="rounded-2xl bg-primary/[0.03] px-5 py-5">
      <div className="flex items-start gap-4">
        <div
          className="flex items-center justify-center shrink-0 w-10 h-10 rounded-full bg-primary/[0.08] text-primary"
          aria-hidden
        >
          <LifeBuoy className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1 space-y-4">
          <HelpHeader
            title="Помощник рядом"
            subtitle="Отвечу про питание, реакции, режим и самочувствие ребёнка."
            rightSlot={profileSelector}
          />
          <div className="flex flex-col gap-3">
            <HelpPrimaryCTA onClick={handleAsk}>Задать вопрос</HelpPrimaryCTA>
            {memberName && (
              <button
                type="button"
                onClick={handleSecondary}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground text-left w-fit py-2 px-0 rounded-md border-0 bg-transparent hover:bg-primary/[0.06] transition-colors no-underline"
              >
                <MessageCircle className="w-4 h-4 shrink-0 opacity-70" aria-hidden />
                Как сегодня себя чувствует {memberName}?
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
