import { type ReactNode } from "react";
import { Info, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface SystemHintCardProps {
  /** Текст подсказки (короткий для редиректа: «Этот вопрос лучше задать во вкладке «Помощник».»). */
  text: string;
  /** Ключ темы Помощника для /sos?scenario= */
  topicKey?: string;
  /** Короткое название темы для карточки (например «Аллергия на продукты»). */
  topicShortTitle?: string;
  /** При клике на кнопку: открыть вкладку Помощник. Для нерелевантных запросов не передавать — кнопка не показывается. */
  onOpenAssistant?: (topicKey?: string) => void;
  /** Слот для кнопки меню (⋯) в правом верхнем углу карточки. */
  actionSlot?: ReactNode;
  /** Время сообщения — одно отображение внутри карточки. */
  timestamp?: Date;
}

/**
 * Карточка системной подсказки для редиректа в Помощник или нерелевантного запроса.
 * Нейтральная иконка Info, короткий текст, при наличии темы — «Тема: {topicShortTitle}», кнопка «Перейти в Помощник».
 */
export function SystemHintCard({
  text,
  topicKey,
  topicShortTitle,
  onOpenAssistant,
  actionSlot,
  timestamp,
}: SystemHintCardProps) {
  const hasTopic = !!topicKey && !!topicShortTitle;

  return (
    <div
      className="relative rounded-xl border border-border bg-muted p-4 text-sm"
      data-system-hint
    >
      {actionSlot != null && (
        <div className="absolute top-2 right-2 shrink-0" aria-hidden>
          {actionSlot}
        </div>
      )}
      <div className="flex gap-3 pr-8">
        <Info
          className="h-4 w-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-muted-foreground leading-snug">{text}</p>
          {hasTopic && (
            <p className="text-xs text-muted-foreground">
              Тема: {topicShortTitle}
            </p>
          )}
          {onOpenAssistant != null && (
            <Button
              variant="outline"
              size="sm"
              className="mt-2 h-8 gap-1.5"
              onClick={() => onOpenAssistant(topicKey)}
            >
              {hasTopic ? "Перейти в тему" : "Перейти в Помощник"}
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          )}
          {timestamp != null && (
            <p className="text-xs text-muted-foreground pt-0.5">
              {timestamp.toLocaleTimeString("ru-RU", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
