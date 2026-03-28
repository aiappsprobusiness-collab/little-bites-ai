# План: снятие UI цели питания и нейтральный подбор (март 2026)

## Продукт

- Во вкладке **«План»** убран выбор nutrition goal под датой (чипса/селектор, locked/premium для этой фичи, paywall `plan_goal_select`).
- **Nutrition goals** остаются атрибутом рецепта: превью в плане, полная карточка рецепта, генерация в чате — без изменений по смыслу задачи.

## Backend (generate-plan)

- Убран **скрытый бонус** для рецептов с тегом `balanced`, когда явная цель не передана: раньше в `computeGoalPriorityBonus` при отсутствии `selected_goal` (или «Баланс») срабатывала ветка `else if (goals.includes("balanced")) bonus += 1`.
- Убраны дневные **preferredGoals / blockedGoals / requireBalanced** по nutrition goal тегам (в т.ч. «один balanced на день», штраф без balanced на последних слотах).
- Поле API `selected_goal` (не `balanced`) по-прежнему поддерживается: малый бонус за совпадение + мягкий анти-повтор тега в дне; **текущий фронт не передаёт** это поле.
- Поле `nutrition_goals` в теле запроса не используется для скоринга пула в текущей версии.

## Фронт

- `MealPlanPage`: нет состояния цели, нет `selected_goal` в `runPoolUpgrade`.
- `usePlanGenerationJob`: запросы к Edge без `selected_goal`; параметр `selected_goal` в типе помечен deprecated.
- Удалены `src/components/plan/PlanGoalChipsRow.tsx`, `src/utils/planGoalSelect.ts`.
- В `paywallReasonCopy` ключ `plan_goal_select` убран; легаси-значение мапится в `fallback` через `REASON_ALIASES`.

## Документация

- Обновлён `docs/architecture/PLAN_MENU_PROFILE_AND_RECIPE_SELECTION.md`.
- Обновлён `docs/dev/plan-tab-ui-quiet-hero-2026-03.md` (§3).

## Деплой Edge

После мержа: задеплоить функцию **`generate-plan`** через Supabase CLI, например `npx supabase functions deploy generate-plan` (в `package.json` отдельного npm-скрипта для неё может не быть).
