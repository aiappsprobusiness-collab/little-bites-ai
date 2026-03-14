import { useState } from "react";
import { LifeBuoy, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MemberSelectorButton } from "@/components/family/MemberSelectorButton";
import { QUICK_HELP_CHIPS } from "@/data/helpTopicChips";
import { cn } from "@/lib/utils";

export interface SosHeroProps {
  /** Открыть chat sheet и отправить это сообщение первым. */
  onOpenWithMessage: (text: string) => void;
  /** Осталось вопросов к Помощнику сегодня. null = безлимит (paid). */
  helpRemaining?: number | null;
  /** Лимит на сегодня исчерпан (free). */
  helpLimitExceeded?: boolean;
  /** Заблокировать ввод и чипсы при 0 лимите (опционально). */
  disabled?: boolean;
  /** Есть доступ (Premium/Trial). Для Free при тапе по premium-чипу открывать paywall. */
  hasAccess?: boolean;
  /** Вызвать при тапе по premium-чипу у Free пользователя — открыть paywall. */
  onPremiumChipTap?: () => void;
}

export function SosHero({
  onOpenWithMessage,
  helpRemaining,
  helpLimitExceeded,
  disabled = false,
  hasAccess = true,
  onPremiumChipTap,
}: SosHeroProps) {
  const [inputValue, setInputValue] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed || disabled) return;
    onOpenWithMessage(trimmed);
    setInputValue("");
  };

  const handleChipClick = (chip: (typeof QUICK_HELP_CHIPS)[0]) => {
    if (disabled) return;
    if (chip.access === "paid" && !hasAccess && onPremiumChipTap) {
      onPremiumChipTap();
      return;
    }
    onOpenWithMessage(chip.text);
  };

  return (
    <div className="shrink-0 rounded-2xl border border-border bg-card shadow-soft p-4">
      <div className="flex items-start gap-3 mb-4">
        <div
          className="flex items-center justify-center shrink-0 w-9 h-9 rounded-full bg-muted text-primary"
          aria-hidden
        >
          <LifeBuoy className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-foreground tracking-tight">
            Помощник рядом
          </h2>
          <p className="text-xs text-muted-foreground mt-1 leading-snug">
            Что происходит с ребёнком?
          </p>
        </div>
        <MemberSelectorButton className="shrink-0" disabled={disabled} />
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex gap-2">
          <Input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ребёнок хуже ест"
            className="flex-1 rounded-xl border-border text-sm placeholder:text-sm"
            disabled={disabled}
            aria-label="Опишите ситуацию"
          />
          <Button
            type="submit"
            size="sm"
            className="shrink-0 rounded-xl"
            disabled={!inputValue.trim() || disabled}
          >
            Спросить
          </Button>
        </div>
        {helpRemaining != null && Number.isFinite(helpRemaining) && (
          <p
            className={cn(
              "text-xs",
              helpLimitExceeded ? "text-amber-600 font-medium" : "text-muted-foreground"
            )}
          >
            {helpLimitExceeded
              ? "Лимит на сегодня исчерпан"
              : `Сегодня осталось: ${helpRemaining} ${helpRemaining === 1 ? "вопрос" : "вопроса"}`}
          </p>
        )}

        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 scrollbar-none" style={{ scrollbarWidth: "none" }}>
          {QUICK_HELP_CHIPS.map((chip) => {
            const isPremium = chip.access === "paid" && !hasAccess;
            return (
              <button
                key={`${chip.label}-${chip.access ?? "free"}`}
                type="button"
                onClick={() => handleChipClick(chip)}
                disabled={disabled}
                className={cn(
                  "shrink-0 px-3 py-2 rounded-full text-[13px] font-medium border transition-colors whitespace-nowrap disabled:opacity-50 disabled:pointer-events-none flex items-center gap-1",
                  isPremium
                    ? "border-amber-200 bg-amber-50/80 text-foreground hover:bg-amber-100/80 active:bg-amber-100"
                    : "border-border bg-background text-foreground hover:bg-muted/30 active:bg-muted/50"
                )}
              >
                {isPremium && <Star className="w-3 h-3 text-premium-star shrink-0" aria-hidden />}
                {chip.label}
              </button>
            );
          })}
        </div>
      </form>
    </div>
  );
}
