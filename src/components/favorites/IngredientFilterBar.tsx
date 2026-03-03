import { useState, useCallback, useRef } from "react";
import { X, RotateCcw, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type IngredientFilterMode = "include" | "exclude";

export interface IngredientFilterBarProps {
  /** Текущий список выбранных ингредиентов (токенов). */
  selectedIngredients: string[];
  /** Вызов при изменении списка. */
  onSelectedChange: (ingredients: string[]) => void;
  /** Режим: показывать рецепты, где есть хотя бы один из ингредиентов (include) или скрывать такие (exclude). */
  mode?: IngredientFilterMode;
  onModeChange?: (mode: IngredientFilterMode) => void;
  /** Дополнительный класс. */
  className?: string;
  /** Плейсхолдер поля поиска. */
  placeholder?: string;
  disabled?: boolean;
}

const DEFAULT_PLACEHOLDER = "Ингредиент…";

/**
 * Общий UI фильтра по ингредиентам: поле поиска + чипсы выбранных + сброс.
 * Переиспользуется в Favorites и My Recipes.
 */
export function IngredientFilterBar({
  selectedIngredients,
  onSelectedChange,
  mode = "include",
  onModeChange,
  className,
  placeholder = DEFAULT_PLACEHOLDER,
  disabled = false,
}: IngredientFilterBarProps) {
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const addIngredient = useCallback(
    (term: string) => {
      const t = term.trim();
      if (!t) return;
      const lower = t.toLowerCase();
      if (selectedIngredients.some((s) => s.toLowerCase() === lower)) return;
      onSelectedChange([...selectedIngredients, t]);
      setInputValue("");
    },
    [selectedIngredients, onSelectedChange]
  );

  const removeIngredient = useCallback(
    (index: number) => {
      onSelectedChange(selectedIngredients.filter((_, i) => i !== index));
    },
    [selectedIngredients, onSelectedChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        addIngredient(inputValue);
      }
      if (e.key === "Backspace" && !inputValue && selectedIngredients.length > 0) {
        removeIngredient(selectedIngredients.length - 1);
      }
    },
    [inputValue, addIngredient, selectedIngredients, removeIngredient]
  );

  const handleReset = useCallback(() => {
    onSelectedChange([]);
    setInputValue("");
    inputRef.current?.focus();
  }, [onSelectedChange]);

  const hasActiveFilter = selectedIngredients.length > 0;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[140px] max-w-[280px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => inputValue.trim() && addIngredient(inputValue)}
            placeholder={placeholder}
            disabled={disabled}
            className="pl-8 h-9"
            aria-label="Добавить ингредиент для фильтра"
          />
        </div>
        {onModeChange && (
          <div className="flex rounded-md border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => onModeChange("include")}
              className={cn(
                "px-3 py-1.5 text-xs font-medium transition-colors",
                mode === "include"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/50 text-muted-foreground hover:text-foreground"
              )}
            >
              Есть
            </button>
            <button
              type="button"
              onClick={() => onModeChange("exclude")}
              className={cn(
                "px-3 py-1.5 text-xs font-medium transition-colors",
                mode === "exclude"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/50 text-muted-foreground hover:text-foreground"
              )}
            >
              Нет
            </button>
          </div>
        )}
        {hasActiveFilter && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="h-9 gap-1 text-muted-foreground hover:text-foreground"
            aria-label="Сбросить фильтр по ингредиентам"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Сбросить
          </Button>
        )}
      </div>
      {selectedIngredients.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedIngredients.map((ing, i) => (
            <span
              key={`${ing}-${i}`}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 text-foreground text-xs pl-2.5 pr-1 py-0.5"
            >
              <span className="max-w-[120px] truncate">{ing}</span>
              <button
                type="button"
                onClick={() => removeIngredient(i)}
                className="p-0.5 rounded-full hover:bg-primary/20 touch-manipulation"
                aria-label={`Убрать ${ing}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
