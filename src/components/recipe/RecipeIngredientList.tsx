import { ingredientDisplayLabel, type IngredientItem } from "@/types/recipe";
import type { ParsedIngredient } from "@/utils/parseChatRecipes";
import { recipeSectionLabel } from "@/theme/recipeTokens";
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
  if (ingredients.length === 0) {
    return (
      <div className={className}>
        <p className={cn(recipeSectionLabel, "mb-1.5")}>
          Ингредиенты (на {servingsCount} {servingsLabel(servingsCount)})
        </p>
        <p className="text-xs text-muted-foreground">{emptyLabel}</p>
      </div>
    );
  }

  const label = servingsLabel(servingsCount);
  const title = `Ингредиенты (на ${servingsCount} ${label})`;

  return (
    <div className={className}>
      <p className={cn(recipeSectionLabel, "mb-2")}>{title}</p>
      <ul className="space-y-0 divide-y divide-border/60" aria-label={title}>
        {ingredients.map((ing, idx) => {
          const displayText = getDisplayText(ing, overrides[idx] ?? scaledOverrides?.[idx]);
          const { name, amount } = splitNameAndAmount(displayText);
          return (
            <li
              key={idx}
              className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0"
            >
              <span className="min-w-0 flex-1 text-sm text-foreground break-words leading-snug">
                {name || "Ингредиент"}
              </span>
              {amount ? (
                <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
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
