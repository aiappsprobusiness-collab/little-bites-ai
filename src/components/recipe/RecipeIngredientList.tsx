import { ingredientDisplayLabel, type IngredientItem } from "@/types/recipe";
import type { ParsedIngredient } from "@/utils/parseChatRecipes";
import { capitalizeIngredientName, shortenIngredientName } from "@/utils/ingredientDisplay";
import { recipeIngredientsSectionTitle } from "@/theme/recipeTokens";
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
  emptyLabel?: string;
  className?: string;
}

export function RecipeIngredientList({
  ingredients,
  overrides = {},
  scaledOverrides,
  servingsCount,
  emptyLabel = "ИИ уточняет состав…",
  className,
}: RecipeIngredientListProps) {
  const label = servingsLabel(servingsCount);
  const title = `Ингредиенты (на ${servingsCount} ${label})`;

  if (ingredients.length === 0) {
    return (
      <div className={className}>
        <p className={cn(recipeIngredientsSectionTitle, "mb-1.5")} aria-hidden>
          <span className="text-sm opacity-80" aria-hidden>🥣</span>
          {title}
        </p>
        <p className="text-xs text-muted-foreground">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className={className}>
      <p className={cn(recipeIngredientsSectionTitle, "mb-2")} aria-hidden>
        <span className="text-sm opacity-80" aria-hidden>🥣</span>
        {title}
      </p>
      <ul className="space-y-0 divide-y divide-[rgba(0,0,0,0.05)]" aria-label={title}>
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
