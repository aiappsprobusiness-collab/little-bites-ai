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

/** Пустые подстановки: всегда Record<number, string> (например {}), не массив. */
export type IngredientOverrides = Record<number, string>;

export interface IngredientChipsProps {
  ingredients: IngredientDisplayItem[];
  overrides?: IngredientOverrides;
  /** Масштабированные подписи по индексу (порции); приоритет ниже, чем overrides. Пусто = {} */
  scaledOverrides?: IngredientOverrides;
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
  /** Скрыть заголовок «Ингредиенты» (для превью-карточек) */
  hideSectionLabel?: boolean;
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
  hideSectionLabel = false,
  className,
}: IngredientChipsProps) {
  const total = ingredients.length;
  const visible = maxVisible != null && maxVisible > 0 ? ingredients.slice(0, maxVisible) : ingredients;
  const extraCount = maxVisible != null && maxVisible > 0 ? Math.max(0, total - maxVisible) : 0;

  const renderChip = (ing: IngredientDisplayItem, idx: number) => {
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
              className="text-muted-foreground shrink-0 p-0.5 rounded-full hover:bg-muted touch-manipulation opacity-60 hover:opacity-100 transition-opacity duration-150"
              title="Доступно в Premium"
              aria-label="Замена ингредиентов доступна в Premium"
            >
              <Lock className="w-3 h-3" />
            </button>
          ) : (
            <span className="text-muted-foreground shrink-0 opacity-60" title="Доступно в Premium">
              <Lock className="w-3 h-3" />
            </span>
          )
        ) : null}
      </div>
    );
  };

  if (total === 0) {
    return (
      <div className={className}>
        {!hideSectionLabel && <p className={cn(recipeSectionLabel, "mb-1.5")}>Ингредиенты</p>}
        <p className="text-xs text-muted-foreground">{emptyLabel}</p>
      </div>
    );
  }

  const showLabel = !hideSectionLabel;
  const restChips = visible.length > 0 && extraCount > 0 ? visible.slice(0, -1) : visible;
  const lastChip = visible.length > 0 && extraCount > 0 ? visible[visible.length - 1] : null;

  return (
    <div className={className}>
      {showLabel && <p className={cn(recipeSectionLabel, "mb-2")}>Ингредиенты</p>}
      <div className="flex flex-wrap gap-x-2.5 gap-y-3">
        {restChips.map((ing, idx) => renderChip(ing, idx))}
        {lastChip != null ? (
          <span className="inline-flex items-center gap-2.5 shrink-0">
            {renderChip(lastChip, visible.length - 1)}
            <span
              className={cn(
                recipeIngredientChip,
                variant === "preview" ? "text-typo-caption h-6" : ""
              )}
            >
              +{extraCount}
            </span>
          </span>
        ) : extraCount > 0 ? (
          <span
            className={cn(
              recipeIngredientChip,
              "shrink-0",
              variant === "preview" ? "text-typo-caption h-6" : ""
            )}
          >
            +{extraCount}
          </span>
        ) : null}
      </div>
    </div>
  );
}
