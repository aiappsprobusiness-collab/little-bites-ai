import { forwardRef, useCallback, useLayoutEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
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

    return (
      <div
        className={cn(
          "relative z-20 shrink-0 border-t border-border bg-background",
          "p-4 pt-2 max-w-full overflow-x-hidden",
          className
        )}
      >
        <div className="flex w-full min-w-0 max-w-full items-end gap-2">
          <div className="relative flex-1 min-w-0">
            {showPlaceholderOverlay && (
              <div
                className="absolute inset-0 flex items-center pointer-events-none rounded-xl py-2.5 px-3"
                aria-hidden
              >
                <AnimatePresence mode="wait">
                  <motion.span
                    key={placeholderIndex}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="text-sm text-muted-foreground truncate"
                  >
                    {currentPlaceholder}
                  </motion.span>
                </AnimatePresence>
              </div>
            )}
            <Textarea
              ref={setTextareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onInput={syncTextareaHeight}
              onKeyDown={onKeyDown}
              placeholder={mode === "help" ? placeholder : ""}
              disabled={disabled}
              rows={1}
              className={cn(
                "flex-1 min-w-0 min-h-[44px] max-h-[120px] w-full resize-none scrollbar-none",
                "rounded-xl border-border focus-visible:border-primary/40 border-primary/20",
                "leading-5 text-sm py-2.5 px-3 placeholder:text-muted-foreground",
                "transition-[height] duration-100 ease-out"
              )}
            />
          </div>

          <Button
            type="button"
            size="icon"
            disabled={!value.trim() || isSending || disabled}
            onClick={onSend}
            aria-label="Отправить"
            className="h-11 w-11 shrink-0 rounded-xl bg-primary text-primary-foreground"
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
