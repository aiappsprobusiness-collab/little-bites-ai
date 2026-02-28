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

/** Hero-карточка (Recipe Details): лёгкая тень, 20px padding, без внутренних разделителей */
export const recipeHeroCard =
  "rounded-2xl border border-border/80 bg-card p-5 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06),0_4px_16px_-6px_rgba(0,0,0,0.04)]";

/** Время в hero: мелко, muted */
export const recipeTimeClass = "inline-flex items-center gap-1.5 text-xs text-muted-foreground";

/** Бейдж типа приёма пищи: оливковый фон, белый текст */
export const recipeMealBadge =
  "inline-flex items-center rounded-full bg-primary text-primary-foreground text-[11px] font-medium px-2.5 py-1";

/** Чипсы ингредиентов: тонкий бордер, лёгкий hover/press */
export const recipeIngredientChip =
  "inline-flex items-center gap-1.5 max-w-full rounded-full px-2.5 py-1.5 bg-primary-light/70 border border-primary-border/60 transition-colors duration-150 hover:border-primary-border/90 active:bg-primary-light";

export const recipeIngredientChipText =
  "text-foreground font-medium text-xs min-w-0 max-w-full truncate whitespace-nowrap overflow-hidden text-ellipsis";

/** Блок «Совет от шефа»: премиум callout, больше padding, опциональный акцент */
export const recipeChefAdviceCard =
  "rounded-2xl p-5 border border-primary-border/50 bg-primary/[0.05] flex gap-3 items-start border-l-2 border-l-primary/20";

/** Мини-совет (free): нейтральный фон */
export const recipeMiniAdviceCard =
  "rounded-xl p-3 border border-border bg-muted/30 flex gap-2.5 items-start";

/** Мета-строка (время, аудитория) */
export const recipeMetaRow = "flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground";

/** Заголовок секции (Ингредиенты, Шаги) */
export const recipeSectionLabel = "text-xs font-medium text-muted-foreground uppercase tracking-wide";

/** Нумерация шагов: жирный номер в лёгком круге */
export const recipeStepNum = "inline-flex shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold items-center justify-center";
export const recipeStepText = "text-sm text-foreground leading-[1.6] flex-1 min-w-0 break-words";

/** Чипса КБЖУ: тот же стиль, что и ингредиенты (мягкая, спокойная) */
export const recipeNutritionChip =
  "inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 bg-primary-light/70 border border-primary-border/60 text-xs text-foreground";
/** Ккал с мягким primary (деталь/чат) */
export const recipeNutritionChipKcal =
  "inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 bg-primary/10 border border-primary-border/50 text-xs text-primary";
/** БЖУ вторичные (менее контрастные) */
export const recipeNutritionChipBju =
  "inline-flex items-center gap-1 rounded-full px-2 py-1 bg-muted/50 border border-border/60 text-xs text-muted-foreground";
/** Компактная ккал в meta-row (план): как время, часть строки мета */
export const recipeNutritionMetaKcal =
  "inline-flex items-center gap-1 text-xs text-muted-foreground";
