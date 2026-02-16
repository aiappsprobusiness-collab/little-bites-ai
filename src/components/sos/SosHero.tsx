import { ReactNode } from "react";
import { LifeBuoy } from "lucide-react";
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
    <div
      className="rounded-2xl p-5 w-full overflow-hidden"
      style={{
        background: "var(--gradient-hero)",
        boxShadow: "var(--shadow-soft)",
      }}
    >
      <div className="flex items-start gap-4">
        <div
          className="flex items-center justify-center shrink-0 w-12 h-12 rounded-full bg-primary/10 text-primary"
          aria-hidden
        >
          <LifeBuoy className="w-6 h-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold text-foreground tracking-tight">
            Помощник рядом
          </h2>
          {profileSelector != null && (
            <div className="mt-1.5 flex items-center">{profileSelector}</div>
          )}
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            Отвечу про питание, реакции, режим и самочувствие ребёнка.
          </p>
          <div className="flex flex-col gap-2 mt-4">
            <Button
              size="default"
              className="w-full sm:w-auto rounded-xl font-medium"
              onClick={handleAsk}
            >
              Задать вопрос
            </Button>
            {memberName && (
              <button
                type="button"
                onClick={handleSecondary}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 text-left"
              >
                Как сегодня себя чувствует {memberName}?
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
