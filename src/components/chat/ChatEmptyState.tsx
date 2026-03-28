import { motion } from "framer-motion";
import { MemberSelectorButton } from "@/components/family/MemberSelectorButton";
import { TabProfileMenuRow } from "@/components/layout/TabProfileMenuRow";
import { cn } from "@/lib/utils";

/**
 * Фон карточек пустого чата: не белый.
 * bg-card в теме = 0 0% 100% (белый), поэтому для пустого состояния используем
 * существующий tinted surface: bg-primary-light + border-primary-border
 * (tailwind.config: primary.light = var(--color-primary-light), index.css: #F3F6EC;
 *  primary.border = var(--color-primary-border), index.css: #DCE3C7).
 * Тот же токен используется в QuickPromptsSheet, MealCard chips, .ingredient-chip.
 */
const CHAT_EMPTY_CARD_SURFACE =
  "relative rounded-2xl bg-primary-light border border-primary-border shadow-soft";

/** Тексты быстрых подсказок для пустого состояния (на «вы», 1–2 строки). */
export const EMPTY_STATE_QUICK_SUGGESTIONS = [
  "Приготовить из того, что есть дома:",
  "Подбери завтрак с кальцием",
  "Посоветуй быстрый ужин",
  "Полезный перекус",
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
  /** Справа в первой строке: бейдж подписки + кнопка меню ⋮ (как на вкладке План). */
  headerRight?: React.ReactNode;
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
  headerRight,
  className,
}: ChatEmptyStateProps) {
  const welcomeLine1 = isFamily
    ? "Здравствуйте, я — ваш личный помощник Momrecipes! Подберу блюда для всей семьи и учту возраст и особенности питания."
    : `Здравствуйте, я — ваш личный помощник Momrecipes! Подберу блюда для профиля ${profileName} и учту возраст и особенности питания.`;
  const welcomeLine2 = "Напишите запрос или выберите подсказку ниже.";

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {/* Верхняя строка: как на Плане — профиль | бейдж + ⋮ */}
      <TabProfileMenuRow
        className="shrink-0"
        profileSlot={
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <MemberSelectorButton onProfileChange={onProfileChange} className="shrink-0" />
            {headerMeta != null && <div className="min-w-0 flex-1">{headerMeta}</div>}
          </div>
        }
        trailing={headerRight}
      />
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

      {/* Приветственная карточка — tinted surface (bg-primary-light), не белый */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
        className={cn(CHAT_EMPTY_CARD_SURFACE, "p-[18px] max-w-[85%]")}
      >
        <p className="text-[15px] leading-[1.45] text-foreground whitespace-pre-wrap">
          {welcomeLine1}
          {"\n\n"}
          {welcomeLine2}
        </p>
      </motion.div>

      {/* Подсказки: размер шрифта ровно как в пузырьке пользователя (12px), баблы крупнее */}
      <div className="flex flex-col gap-3 mt-3">
        {[...suggestions].slice(0, 4).map((text) => (
          <motion.button
            key={text}
            type="button"
            onClick={() => onSuggestionClick(text)}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "relative rounded-2xl shadow-soft max-w-[85%] self-end text-left",
              "px-4 py-4 min-h-[48px]",
              "text-[15px] leading-snug break-words font-normal",
              "bg-[#607D3B] text-white",
              "cursor-pointer hover:bg-[#556b33] active:scale-[0.98] active:shadow-none",
              "transition-[background-color,transform] duration-100"
            )}
          >
            {text}
          </motion.button>
        ))}
      </div>
    </div>
  );
}
