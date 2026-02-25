import { Lock, RotateCcw } from "lucide-react";
import { ingredientDisplayLabel, type IngredientItem } from "@/types/recipe";
import type { ParsedIngredient, IngredientWithSubstitute } from "@/utils/parseChatRecipes";
import { recipeIngredientChip, recipeIngredientChipText, recipeSectionLabel } from "@/theme/recipeTokens";
import { cn } from "@/lib/utils";

export type IngredientChipsVariant = "preview" | "full";

/** Элемент для отображения: строка или объект с name/display_text */
export type IngredientDisplayItem = string | IngredientItem | ParsedIngredient;

function getDisplayText(
  item: IngredientDisplayItem,
  override: string | undefined
): string {
  if (override != null && override.trim()) return override;
  if (typeof item === "string") return item.trim() || "Ингредиент";
  return ingredientDisplayLabel(item as IngredientItem) || "Ингредиент";
}

function getIngredientName(item: IngredientDisplayItem): string {
  if (typeof item === "string") return item;
  const o = item as { name?: string };
  return o?.name ?? "";
}

export interface IngredientChipsProps {
  ingredients: IngredientDisplayItem[];
  overrides?: Record<number, string>;
  /** Масштабированные подписи по индексу (порции); приоритет ниже, чем overrides */
  scaledOverrides?: Record<number, string>;
  /** Для preview: показывать только первые N чипсов + "+M" */
  maxVisible?: number;
  variant?: IngredientChipsVariant;
  /** Показывать кнопку замены (Premium) или замочек */
  showSubstituteButton?: boolean;
  onSubstituteClick?: (idx: number, ing: IngredientDisplayItem) => void;
  /** При showSubstituteButton и отсутствии onSubstituteClick: клик по замку (пейволл) */
  onLockClick?: () => void;
  /** Текст при пустом списке */
  emptyLabel?: string;
  className?: string;
}

export function IngredientChips({
  ingredients,
  overrides = {},
  scaledOverrides,
  maxVisible,
  variant = "full",
  showSubstituteButton = false,
  onSubstituteClick,
  onLockClick,
  emptyLabel = "ИИ уточняет состав…",
  className,
}: IngredientChipsProps) {
  const total = ingredients.length;
  const visible = maxVisible != null && maxVisible > 0 ? ingredients.slice(0, maxVisible) : ingredients;
  const extraCount = maxVisible != null && maxVisible > 0 ? Math.max(0, total - maxVisible) : 0;

  if (total === 0) {
    return (
      <div className={className}>
        <p className={cn(recipeSectionLabel, "mb-1.5")}>Ингредиенты</p>
        <p className="text-xs text-muted-foreground">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className={className}>
      <p className={cn(recipeSectionLabel, "mb-1.5")}>Ингредиенты</p>
      <div className="flex flex-wrap gap-2">
        {visible.map((ing, idx) => {
          const displayText = getDisplayText(ing, overrides[idx] ?? scaledOverrides?.[idx]);
          const name = getIngredientName(ing);
          return (
            <div
              key={idx}
              className={cn(
                recipeIngredientChip,
                variant === "preview" && "max-w-[120px]"
              )}
            >
              <span className={cn(recipeIngredientChipText, variant === "preview" && "text-typo-caption")}>
                {displayText}
              </span>
              {showSubstituteButton && onSubstituteClick ? (
                <button
                  type="button"
                  onClick={() => onSubstituteClick(idx, ing)}
                  className="shrink-0 p-0.5 rounded-full hover:bg-primary/10 text-primary touch-manipulation"
                  aria-label={`Заменить: ${name}`}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              ) : showSubstituteButton ? (
                onLockClick ? (
                  <button
                    type="button"
                    onClick={onLockClick}
                    className="text-muted-foreground shrink-0 p-0.5 rounded-full hover:bg-muted touch-manipulation"
                    title="Доступно в Premium"
                    aria-label="Замена ингредиентов доступна в Premium"
                  >
                    <Lock className="w-3 h-3" />
                  </button>
                ) : (
                  <span className="text-muted-foreground shrink-0" title="Доступно в Premium">
                    <Lock className="w-3 h-3" />
                  </span>
                )
              ) : null}
            </div>
          );
        })}
        {extraCount > 0 && (
          <span
            className={cn(
              recipeIngredientChip,
              "shrink-0",
              variant === "preview" ? "text-typo-caption h-6" : ""
            )}
          >
            +{extraCount}
          </span>
        )}
      </div>
    </div>
  );
}
