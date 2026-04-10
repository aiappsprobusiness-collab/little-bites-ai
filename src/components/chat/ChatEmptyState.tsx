import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Фон карточек пустого чата: не белый.
 * bg-card в теме = 0 0% 100% (белый), поэтому для пустого состояния используем
 * существующий tinted surface: bg-primary-light + border-primary-border
 * Чипсы опираются на токены primary-light / primary-border (см. tailwind.config + index.css).
 * Тот же токен используется в QuickPromptsSheet, MealCard chips, .ingredient-chip.
 */
const CHAT_EMPTY_CARD_SURFACE =
  "relative rounded-2xl bg-primary-light border border-primary-border shadow-soft";

/**
 * Как колонка ответа ассистента с карточкой рецепта в `ChatMessage`: обёртка `max-w-[96%]`.
 * Карточка рецепта внутри — `w-full` (см. `recipeTokens.recipeCard`).
 */
const WIDTH_ASSISTANT_LIKE = "w-full max-w-[96%] self-start";

/**
 * Как пузырёк пользователя в `ChatMessage`: обёртка `max-w-[80%]`.
 */
const WIDTH_USER_BUBBLE_LIKE = "w-full max-w-[80%] self-end";

/**
 * Тот же силуэт, что у `role === "user"` в ChatMessage (не «таблетка», а сообщение с хвостом).
 */
const USER_BUBBLE_SHELL =
  "rounded-2xl rounded-br-sm border border-primary/25 shadow-soft";

/**
 * Текст как у поля ввода чата (`ChatInputBar`: `text-sm leading-5`) и читаемого тела в ленте.
 */
const EMPTY_STATE_BODY_TEXT = "text-sm leading-relaxed text-foreground";

/** Заголовок блока — ближе к шапке рецепта в чате (`RecipeHeader` chat: ~15px). */
const EMPTY_STATE_TITLE_TEXT = "text-[15px] font-semibold leading-snug text-foreground";

/** Тексты быстрых подсказок для пустого состояния (1 строка на кнопку). */
export const EMPTY_STATE_QUICK_SUGGESTIONS = [
  "Что приготовить из того, что есть дома",
  "Завтрак с кальцием",
  "Быстрый ужин на сегодня",
  "Полезный перекус для ребёнка",
] as const;

export interface ChatEmptyStateProps {
  /** Подсказки для плашек (обычно 4). */
  suggestions?: readonly string[];
  /** Клик по подсказке: подставить текст в поле ввода. */
  onSuggestionClick: (text: string) => void;
  /** Класс контейнера. */
  className?: string;
}

/**
 * Пустое состояние вкладки «Чат» (режим рецептов): приветственная карточка и подсказки.
 * Ширины и типографика согласованы с лентой сообщений и карточкой рецепта (см. ChatMessage + RecipeCard chat).
 */
export function ChatEmptyState({
  suggestions = EMPTY_STATE_QUICK_SUGGESTIONS,
  onSuggestionClick,
  className,
}: ChatEmptyStateProps) {
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
        className={cn(CHAT_EMPTY_CARD_SURFACE, "p-3 sm:p-4", WIDTH_ASSISTANT_LIKE)}
      >
        <div className={cn(EMPTY_STATE_BODY_TEXT, "space-y-2.5")}>
          <p className={EMPTY_STATE_TITLE_TEXT}>
            Этот чат — ваш помощник по рецептам <span aria-hidden>🍲</span>
          </p>
          <p>
            Здесь мы не общаемся, а быстро подбираем блюда для выбранного вами члена семьи с учётом
            возраста и питания.
          </p>
          <p>Просто напишите, что хотите приготовить — и получите готовые идеи блюд.</p>
          <p>Напишите запрос или выберите подсказку ниже.</p>
        </div>
      </motion.div>

      <div className="flex flex-col gap-2 mt-1">
        {[...suggestions].slice(0, 4).map((text) => (
          <motion.button
            key={text}
            type="button"
            onClick={() => onSuggestionClick(text)}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "relative text-left break-words",
              WIDTH_USER_BUBBLE_LIKE,
              "px-3 py-3",
              "text-sm leading-5 font-normal",
              "bg-primary text-primary-foreground",
              USER_BUBBLE_SHELL,
              "cursor-pointer hover:bg-primary/90 active:scale-[0.98] active:shadow-none",
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
