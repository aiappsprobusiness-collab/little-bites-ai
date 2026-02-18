import { ReactNode } from "react";
import { LifeBuoy, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

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
    <div className="rounded-2xl p-4 sm:p-5 w-full border border-border bg-card">
      <div className="flex items-start gap-3">
        <div
          className="flex items-center justify-center shrink-0 w-9 h-9 rounded-full bg-primary/10 text-primary"
          aria-hidden
        >
          <LifeBuoy className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[18px] font-semibold text-foreground tracking-tight">
              Помощник рядом
            </h2>
            {profileSelector != null && (
              <div className="flex items-center shrink-0">{profileSelector}</div>
            )}
          </div>
          <p className="text-[12px] sm:text-[13px] text-muted-foreground mt-1 leading-snug">
            Отвечу про питание, реакции, режим и самочувствие ребёнка.
          </p>
          <div className="flex flex-col gap-2 mt-3">
            <Button
              size="default"
              className="w-full sm:w-auto h-10 rounded-2xl font-medium bg-primary text-primary-foreground hover:opacity-90 border-0 shadow-[0_2px_12px_rgba(110,127,59,0.15)]"
              onClick={handleAsk}
            >
              Задать вопрос
            </Button>
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
    </div>
  );
}
