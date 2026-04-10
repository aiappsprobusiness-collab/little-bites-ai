import { forwardRef, useCallback, useLayoutEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  applyTextareaAutosize,
  TEXTAREA_AUTOSIZE_DEFAULT_MAX_PX,
} from "@/utils/textareaAutosize";

export interface ChatInputBarProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  isSending: boolean;
  /** Режим рецептов: показывать ротирующийся плейсхолдер поверх пустого поля. */
  mode: "recipes" | "help";
  /** Индекс текущей подсказки в плейсхолдере (режим recipes). */
  placeholderIndex?: number;
  /** Список подсказок для ротации (режим recipes). */
  placeholderSuggestions?: readonly string[];
  /** Статичный плейсхолдер (режим help). */
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Нижняя панель ввода чата: тот же визуальный слой, что composer в `TopicConsultationSheet` («Помощь маме»).
 * Кнопка меню (⋮) — в правом верхнем углу вкладки «Чат» (ChatPage).
 */
export const ChatInputBar = forwardRef<HTMLTextAreaElement | null, ChatInputBarProps>(
  function ChatInputBar(
    {
      value,
      onChange,
      onKeyDown,
      onSend,
      isSending,
      mode,
      placeholderIndex = 0,
      placeholderSuggestions = [],
      placeholder = "",
      disabled = false,
      className,
    },
    ref
  ) {
    const innerRef = useRef<HTMLTextAreaElement | null>(null);

    const setTextareaRef = useCallback(
      (node: HTMLTextAreaElement | null) => {
        innerRef.current = node;
        if (typeof ref === "function") {
          ref(node);
        } else if (ref != null) {
          (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
        }
      },
      [ref]
    );

    const syncTextareaHeight = useCallback(() => {
      applyTextareaAutosize(innerRef.current, TEXTAREA_AUTOSIZE_DEFAULT_MAX_PX);
    }, []);

    useLayoutEffect(() => {
      syncTextareaHeight();
    }, [value, syncTextareaHeight]);

    const showPlaceholderOverlay = mode === "recipes" && !value.trim() && placeholderSuggestions.length > 0;
    const currentPlaceholder = placeholderSuggestions[placeholderIndex];
    const nativePlaceholder =
      mode === "help" ? placeholder : showPlaceholderOverlay ? "" : placeholder;

    return (
      <div
        className={cn(
          "relative z-20 shrink-0 w-full max-w-full overflow-x-hidden",
          /* Без границ и отдельного фона — совпадает с .chat-page-bg родителя */
          "bg-transparent",
          "px-4 pt-2 pb-3",
          className
        )}
      >
        {/* Единая «капсула» composer: скругление только снаружи, без вложенных рамок */}
        <div
          className={cn(
            "chat-composer-capsule",
            "flex w-full min-w-0 max-w-full items-end gap-2",
            /* Как скругления приветственного блока и подсказок в `ChatEmptyState` (`rounded-2xl`). */
            "rounded-2xl overflow-hidden",
            "bg-muted/50 dark:bg-muted/30",
            "pl-3 pr-2 py-2",
            "transition-[border-color] duration-200",
            /* Только оливковая рамка; без ring (box-shadow), иначе в светлой теме видна вторая «обводка». */
            "border-2 border-primary/40",
            "focus-within:border-primary"
          )}
        >
          {/* Колонка по высоте = textarea: иначе items-center на оверлее даёт сдвиг относительно курсора */}
          <div className="relative min-h-[40px] min-w-0 flex-1 self-end overflow-hidden">
            {showPlaceholderOverlay && (
              <div
                className="pointer-events-none absolute inset-x-0 top-0 flex items-start pr-2 pt-2"
                aria-hidden
              >
                <AnimatePresence mode="wait">
                  <motion.span
                    key={placeholderIndex}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="block w-full truncate text-sm leading-5 text-muted-foreground"
                  >
                    {currentPlaceholder}
                  </motion.span>
                </AnimatePresence>
              </div>
            )}
            {/* Нативный textarea: без стилей shadcn Textarea (ring/outline), иначе в Chrome/Edge остаётся синий outline */}
            <textarea
              ref={setTextareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onInput={syncTextareaHeight}
              onKeyDown={onKeyDown}
              placeholder={nativePlaceholder}
              disabled={disabled}
              rows={1}
              autoComplete="off"
              className={cn(
                "chat-composer-field",
                "block min-h-[40px] w-full min-w-0 max-h-[120px] resize-none scrollbar-none",
                "rounded-none border-0 bg-transparent shadow-none",
                "text-foreground",
                "!outline-none focus:!outline-none focus-visible:!outline-none",
                "!shadow-none focus:!shadow-none focus-visible:!shadow-none",
                "!ring-0 !ring-offset-0 focus-visible:!ring-0 focus-visible:!ring-offset-0",
                /* Одна линия с оверлеем: те же text-sm + leading-5 и py-2, что у подсказки */
                "text-sm leading-5 tracking-normal",
                "py-2 pr-2 pl-0 placeholder:text-muted-foreground",
                "transition-[height] duration-100 ease-out",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            />
          </div>

          <Button
            type="button"
            disabled={!value.trim() || isSending || disabled}
            onClick={onSend}
            aria-label="Отправить"
            className={cn(
              "h-10 min-w-10 shrink-0 rounded-xl px-3",
              "bg-primary text-primary-foreground shadow-none",
              "hover:bg-primary/90",
              "ring-offset-0 focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-offset-0",
              "[&_svg]:!size-4"
            )}
          >
            {isSending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>
    );
  }
);
