# Этап 2: узкая invalidation плана и меньше refetch после replace

**Цель:** сократить каскадные refetch `meal_plans_v2` на `/meal-plan`: один механизм синхронизации там, где было два; без широкого `invalidateQueries(['meal_plans_v2', userId])` там, где известна дата; не дергать план после Edge replace, если кэш уже пропатчен.

**Дата внедрения в код:** 2026-04-04 (см. git history).

---

## Что сделано

### 1. Helper узкой инвалидации

- **`src/utils/mealPlanQueryInvalidation.ts`**
  - `mealPlanQueryTouchesPlannedDate(queryKey, userId, plannedDate)` — ключ недели (диапазон), ключ одного дня и бывший `row_exists` попадают под правило, если дата в диапазоне / совпадает.
  - `invalidateMealPlanQueriesForPlannedDate(queryClient, { userId, plannedDate })` — `invalidateQueries` только по этому predicate, с **`refetchType: 'all'`**: иначе после «Добавить в план» с экрана рецепта кэш плана (неактивный observer) не refetch’ится, а `useMealPlans` держит `refetchOnMount: false` — на плане остаётся старый рецепт до F5.

### 2. Двойной invalidate после `replaceSlotWithRecipe`

- **`useReplaceMealSlot`:** убран второй вызов инвалидации после успешного `createMealPlan`. Канон — **`createMealPlan.onSuccess`** в `useMealPlans` (теперь узкий).
- Удалён неиспользуемый флаг `skipInvalidate`; вызовы с `{ skipInvalidate: true }` на плане убраны.

### 3. `createMealPlan` / точечные мутации в `useMealPlans`

- **`createMealPlan.onSuccess`:** узкая инвалидация по `variables.planned_date`.
- **`deleteMealPlan`:** `select` с `planned_date`, возврат `{ planned_date }`, onSuccess — узкая (без широкого fallback при успехе).
- **`updateSlotIngredientOverrides.onSuccess`:** узкая по `params.planned_date`.
- **`updateMealPlan.onSuccess`:** узкая по `data.planned_date`, иначе fallback на широкий префикс (на всякий случай).
- **`markAsCompleted`:** `planned_date` в select, узкая инвалидация.
- **`mealPlanQueryTouchesDate`** внутри хука делегирует в общий `mealPlanQueryTouchesPlannedDate`.

Широкие префиксы **сознательно оставлены** для: `clearWeekPlan`, `createWeekPlan`, эффектов job на странице плана (прогресс / завершение генерации), первичного `runPoolUpgrade` с `day_keys` по всему rolling (см. `MealPlanPage`).

### 4. Edge replace (`replaceMealSlotAuto`) после `applyReplaceSlotToPlanCache`

- **`MealPlanPage`:** после успешного ответа Edge и `applyReplaceSlotToPlanCache` **убран** `invalidateQueries` по префиксу плана. UI и недельный/дневной кэш обновляются патчем; превью подтягиваются через `useRecipePreviewsByIds` при смене id.

### 5. Страница плана: прочие сужения и дубли

- **Fill day** (оба CTA + «последний день без плана»): вместо широкого префикса — `invalidateMealPlanQueriesForPlannedDate` на целевой `day_key`.
- **Fill week:** по-прежнему широкий префикс (затронута вся неделя).
- **Удаление блюда:** убрана лишняя инвалидация в обработчике — достаточно `deleteMealPlan.onSuccess`.
- **Clear day/week:** убран дубль `invalidateQueries` после `clearWeekPlan` (у мутации уже есть invalidate + refetch по predicate).
- **Clear slot + pool fallback:** убран лишний широкий invalidate после `deleteMealPlan` (остаётся узкий onSuccess + `applyClearSlotToPlanCache`).

### 6. `row_exists`

- Отдельный **`getMealPlanRowExists` / query `row_exists` удалены**: на `MealPlanPage` результат нигде не использовался, запрос только давал лишний HTTP. Логика empty/starter опирается на `weekPlans` / `planMealsForSelectedDay` как раньше.

### 7. `useAssignRecipeToPlanSlot`

- Три вызова инвалидации (префикс + неделя + день) заменены одним **`invalidateMealPlanQueriesForPlannedDate`** по `variables.day_key`.

---

## Сознательно не вошло (Этап 3+)

Часть сетевого шума при переходах между вкладками закрыта в **Этапе 3:** `docs/dev/SPA_TAB_NAVIGATION_STAGE3.md`.

- Схлопывание дневного и недельного query в один источник.
- `useFavorites` / `recipe_previews` / `useSubscription` на плане (глобальный рефактор).
- Широкие инвалидации в `useGenerateWeeklyPlan` и эффектах job — пока оставлены как «много дней / фоновая генерация».
- Опциональный фоновый «safety refetch» одного ключа после Edge replace — при расхождении с сервером можно добавить отдельно.

---

## Связанные документы

- Этап 1: `docs/dev/MEAL_PLAN_NETWORK_STAGE1.md`
- Dev-логи React Query: `docs/dev/MEAL_PLAN_RQ_DEBUG.md`
