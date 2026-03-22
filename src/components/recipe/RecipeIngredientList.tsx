import type { ReactNode } from "react";
import { ingredientDisplayLabel, type IngredientItem } from "@/types/recipe";
import type { ParsedIngredient } from "@/utils/parseChatRecipes";
import { capitalizeIngredientName, shortenIngredientName } from "@/utils/ingredientDisplay";
import { servingsLabel } from "@/utils/servingsLabel";
import { cn } from "@/lib/utils";

export type IngredientDisplayItem = string | IngredientItem | ParsedIngredient;
export type IngredientOverrides = Record<number, string>;

function getDisplayText(
  item: IngredientDisplayItem,
  override: string | undefined
): string {
  if (override != null && override.trim()) return override;
  if (typeof item === "string") return item.trim() || "Ингредиент";
  return ingredientDisplayLabel(item as IngredientItem) || "Ингредиент";
}

/** Разбить строку вида "Название — 40 г" на { name, amount }; при отсутствии " — " amount пустой. */
function splitNameAndAmount(displayText: string): { name: string; amount: string } {
  const sep = " — ";
  const idx = displayText.lastIndexOf(sep);
  if (idx === -1) return { name: displayText.trim(), amount: "" };
  return {
    name: displayText.slice(0, idx).trim(),
    amount: displayText.slice(idx + sep.length).trim(),
  };
}

/** Сырое имя ингредиента из объекта (name) или из display-строки. */
function getRawName(item: IngredientDisplayItem, displayText: string): string {
  if (typeof item === "object" && item !== null && "name" in item && typeof (item as { name: string }).name === "string") {
    return (item as { name: string }).name.trim();
  }
  return splitNameAndAmount(displayText).name;
}

export interface RecipeIngredientListProps {
  ingredients: IngredientDisplayItem[];
  overrides?: IngredientOverrides;
  scaledOverrides?: IngredientOverrides;
  /** Текущее количество порций для заголовка */
  servingsCount: number;
  /** Не показывать подпись «На X порций» (например в карточке рецепта в Избранном) */
  hideServingsSubtitle?: boolean;
  /** Элемент справа от заголовка «Ингредиенты» (например компактный выбор порций) */
  headerRight?: ReactNode;
  emptyLabel?: string;
  className?: string;
}

export function RecipeIngredientList({
  ingredients,
  overrides = {},
  scaledOverrides,
  servingsCount,
  hideServingsSubtitle = false,
  headerRight,
  emptyLabel = "ИИ уточняет состав…",
  className,
}: RecipeIngredientListProps) {
  const label = servingsLabel(servingsCount);
  const subtitle = `На ${servingsCount} ${label}`;

  const titleRow = (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
      <p className="text-sm font-semibold text-foreground mb-0 min-w-0" aria-hidden>
        Ингредиенты
      </p>
      {headerRight != null ? <div className="shrink-0">{headerRight}</div> : null}
    </div>
  );

  if (ingredients.length === 0) {
    return (
      <div className={className}>
        {titleRow}
        {!hideServingsSubtitle && <p className="text-[11px] text-muted-foreground/80 mt-1">{subtitle}</p>}
        <p className="text-xs text-muted-foreground mt-1">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className={className}>
      {titleRow}
      {!hideServingsSubtitle && <p className="text-[11px] text-muted-foreground/80 mt-1 mb-2">{subtitle}</p>}
      <ul className="space-y-0 divide-y divide-[rgba(0,0,0,0.05)]" aria-label={hideServingsSubtitle ? "Ингредиенты" : `Ингредиенты, ${subtitle}`}>
        {ingredients.map((ing, idx) => {
          const displayText = getDisplayText(ing, overrides[idx] ?? scaledOverrides?.[idx]);
          const { name, amount } = splitNameAndAmount(displayText);
          const rawName = getRawName(ing, displayText);
          const displayName = capitalizeIngredientName(shortenIngredientName(rawName || name)) || "Ингредиент";
          return (
            <li
              key={idx}
              className="flex items-start gap-3 py-[15px] first:pt-0 last:pb-0"
            >
              <span className="min-w-0 flex-1 text-sm text-foreground break-words leading-snug">
                {displayName}
              </span>
              {amount ? (
                <span className="shrink-0 text-sm font-medium text-foreground/80 tabular-nums">
                  {amount}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
