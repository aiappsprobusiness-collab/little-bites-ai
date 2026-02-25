/**
 * Единые дизайн-токены для карточек рецептов (Chat = эталон).
 * Оливковый акцент, нейтральные chips, мягкие тени.
 * Использовать во всех recipe-компонентах для единого вида.
 */

/** Основная карточка: радиус, бордер, тень */
export const recipeCard =
  "rounded-2xl overflow-hidden bg-card border border-border shadow-soft max-w-[100%] w-full box-border";

/** Hero-шапка: оливковый фон 4–6% */
export const recipeHeaderBg = "bg-primary/[0.06] rounded-t-2xl -mb-px";

/** Бейдж типа приёма пищи: оливковый фон, белый текст */
export const recipeMealBadge =
  "inline-flex items-center rounded-full bg-primary text-primary-foreground text-[11px] font-medium px-2.5 py-1";

/** Время: иконка + текст, вторичный цвет */
export const recipeTimeClass = "inline-flex items-center gap-1 text-xs text-muted-foreground";

/** Чипсы ингредиентов: нейтральный/оливковый (не розовый) */
export const recipeIngredientChip =
  "inline-flex items-center gap-1.5 max-w-full rounded-full px-2.5 py-1 bg-primary-light border border-primary-border";

export const recipeIngredientChipText =
  "text-foreground font-medium text-xs min-w-0 max-w-full truncate whitespace-nowrap overflow-hidden text-ellipsis";

/** Блок «Совет от шефа»: мягкий info, оливковый бордер */
export const recipeChefAdviceCard =
  "rounded-xl p-3 border border-primary-border bg-primary/[0.06] flex gap-2.5 items-start";

/** Мини-совет (free): нейтральный фон */
export const recipeMiniAdviceCard =
  "rounded-xl p-3 border border-border bg-muted/30 flex gap-2.5 items-start";

/** Мета-строка (время, аудитория) */
export const recipeMetaRow = "flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground";

/** Заголовок секции (Ингредиенты, Шаги) */
export const recipeSectionLabel = "text-xs font-medium text-muted-foreground";

/** Нумерация шагов */
export const recipeStepNum = "text-xs font-semibold text-primary shrink-0";
export const recipeStepText = "text-xs text-foreground leading-relaxed flex-1 min-w-0 break-words";
