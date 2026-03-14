import { forwardRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

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
 * Нижняя панель ввода чата: поле ввода (pill) и кнопка отправки.
 * Кнопка меню (⋮) вынесена в правый верхний угол вкладки «Чат» (ChatPage).
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
    const showPlaceholderOverlay = mode === "recipes" && !value.trim() && placeholderSuggestions.length > 0;
    const currentPlaceholder = placeholderSuggestions[placeholderIndex];

    return (
      <div
        className={cn(
          "sticky z-20 shrink-0 border-t border-border bg-background/95 backdrop-blur-sm",
          "px-4 pt-3 pb-0 max-w-full overflow-x-hidden",
          className
        )}
        style={{ bottom: "calc(var(--layout-nav-height) - 3rem)" }}
      >
        <div className="flex w-full items-center gap-2 min-w-0">
          {/* Поле ввода (pill/capsule) */}
          <div className="relative flex-1 min-w-0">
            {showPlaceholderOverlay && (
              <div
                className="absolute inset-0 flex items-center pointer-events-none rounded-full py-3 px-4"
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
              ref={ref}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={mode === "help" ? placeholder : ""}
              disabled={disabled}
              rows={1}
              className={cn(
                "min-h-[44px] max-h-[120px] w-full min-w-0 resize-none",
                "rounded-full bg-[#FFFFFF] border border-[#E6E6E6]",
                "py-3 px-4 text-sm placeholder:text-muted-foreground",
                "focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:border-primary/30"
              )}
            />
          </div>

          {/* Кнопка отправки справа — главное действие, чуть крупнее и с тенью */}
          <button
            type="button"
            disabled={!value.trim() || isSending || disabled}
            onClick={onSend}
            aria-label="Отправить"
            className={cn(
              "h-[46px] w-[46px] shrink-0 rounded-full flex items-center justify-center",
              "text-primary-foreground bg-primary",
              "shadow-[0_2px_6px_rgba(0,0,0,0.08)]",
              "hover:opacity-90 active:scale-95 disabled:opacity-50 disabled:pointer-events-none disabled:shadow-none transition-all"
            )}
          >
            {isSending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    );
  }
);
