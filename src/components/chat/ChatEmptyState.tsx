import { motion } from "framer-motion";
import { MemberSelectorButton } from "@/components/family/MemberSelectorButton";
import { cn } from "@/lib/utils";

/** Тексты быстрых подсказок для пустого состояния (на «вы», 1–2 строки). */
export const EMPTY_STATE_QUICK_SUGGESTIONS = [
  "Подбери завтрак с кальцием",
  "Посоветуй быстрый ужин",
  "Что приготовить без молока и яиц",
] as const;

export interface ChatEmptyStateProps {
  /** Имя выбранного профиля (Семья / имя ребёнка). */
  profileName: string;
  /** Семейный профиль — адаптировать текст приветствия. */
  isFamily: boolean;
  /** Подсказки для плашек (обычно 3). */
  suggestions?: readonly string[];
  /** Клик по подсказке: подставить текст в поле ввода. */
  onSuggestionClick: (text: string) => void;
  /** При смене профиля (очистка чата). */
  onProfileChange?: () => void;
  /** Краткий статус при смене профиля (опционально). */
  profileChangeStatus?: string | null;
  /** Дополнительный контент под pill (например, лимиты). */
  headerMeta?: React.ReactNode;
  /** Класс контейнера. */
  className?: string;
}

/**
 * Пустое состояние вкладки «Чат» (режим рецептов): pill профиля, приветственная карточка, крупные подсказки-плашки.
 * Показывается только при messages.length === 0.
 */
export function ChatEmptyState({
  profileName,
  isFamily,
  suggestions = EMPTY_STATE_QUICK_SUGGESTIONS,
  onSuggestionClick,
  onProfileChange,
  profileChangeStatus,
  headerMeta,
  className,
}: ChatEmptyStateProps) {
  const welcomeLine1 = isFamily
    ? "Я помогу подобрать блюда для всей семьи, учитывая возраст и особенности питания."
    : `Я помогу подобрать блюда для профиля ${profileName}, учитывая возраст и особенности питания.`;
  const welcomeLine2 = "Напишите запрос или выберите подсказку ниже.";

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {/* Верхняя строка: компактная pill профиля */}
      <div className="shrink-0 flex flex-wrap items-center gap-2">
        <MemberSelectorButton
          variant="light"
          onProfileChange={onProfileChange}
          className={cn(
            "!min-h-[36px] !h-9 !px-3 !py-2 !text-sm !font-medium",
            "bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary)/0.9)]",
            "border border-[hsl(var(--primary)/0.2)] hover:bg-[hsl(var(--primary)/0.18)]",
            "max-w-[160px] truncate"
          )}
        />
        {headerMeta != null && <div className="min-w-0 flex-1">{headerMeta}</div>}
      </div>
      {profileChangeStatus && (
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="block text-[12px] text-muted-foreground truncate"
        >
          {profileChangeStatus}
        </motion.span>
      )}

      {/* Приветственная карточка — те же стили, что у карточки AI-сообщения (bg-card, border-border, shadow-soft) */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
        className="rounded-2xl p-[18px] bg-card border border-border shadow-soft max-w-[85%]"
      >
        <p className="text-[15px] leading-[1.45] text-foreground whitespace-pre-wrap">
          {welcomeLine1}
          {"\n\n"}
          {welcomeLine2}
        </p>
      </motion.div>

      {/* Крупные подсказки-плашки — те же стили, что chat bubbles (bg-card, border-border, shadow-soft, rounded-2xl) */}
      <div className="flex flex-col gap-3 mt-3">
        {[...suggestions].slice(0, 3).map((text) => (
          <motion.button
            key={text}
            type="button"
            onClick={() => onSuggestionClick(text)}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "text-left rounded-2xl px-4 py-3.5 w-full max-w-[85%] self-end",
              "bg-card border border-border shadow-soft",
              "text-[15px] font-medium text-foreground leading-snug",
              "cursor-pointer hover:bg-muted/20 active:scale-[0.98] active:shadow-none",
              "transition-transform duration-100 min-h-[44px]"
            )}
          >
            {text}
          </motion.button>
        ))}
      </div>
    </div>
  );
}
