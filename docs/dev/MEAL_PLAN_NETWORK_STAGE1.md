# Этап 1: снижение сетевого шума при старте `/meal-plan`

**Цель:** убрать безопасный лишний трафик при первом открытии экрана плана без глубокого рефакторинга data-layer.

**Дата внедрения в код:** 2026-04-04 (см. git history).

---

## Что сделано

### 1. Replace flow — списки `recipes`

- **Было:** `useReplaceMealSlot` вызывал `useRecipes`, который на каждом монтировании плана поднимал три `useQuery` (список, избранное-ветка, недавние).
- **Стало:** в `useRecipes` добавлен опциональный флаг `listQueriesEnabled` (по умолчанию `true`). На `MealPlanPage` в `useReplaceMealSlot` передаётся `recipeListQueriesEnabled: true` только когда `replacingSlotKey != null` **или** открыт контекст `poolExhaustedContext` (sheet «пул исчерпан»).
- **Мутации** (`createRecipe` и т.д.) не зависят от этих запросов; `replaceMealSlotAuto` / пул / Edge не используют кэш списков.

**Файлы:** `src/hooks/useRecipes.tsx`, `src/hooks/useReplaceMealSlot.ts`, `src/pages/MealPlanPage.tsx`.

### 2. Shopping list на плане

- **Было:** `BuildShoppingListFromPlanSheet` всегда вызывал `useShoppingList()` → запросы активного списка и позиций при монтировании страницы плана.
- **Стало:** `useShoppingList({ enabled: open })` в sheet — загрузка только при открытом bottom sheet «Собрать список».
- **Ключ кэша:** `["shopping_list_active", userId]` вместо глобального `["shopping_list_active"]`, чтобы не смешивать аккаунты в одной вкладке. Экспорт: `activeShoppingListQueryKey`.

**Файлы:** `src/hooks/useShoppingList.ts`, `src/components/plan/BuildShoppingListFromPlanSheet.tsx`.

Остальные потребители (`RecipePage`, `ShoppingListView`) по-прежнему используют `useShoppingList()` без опций.

### 3. Plan generation job

- **Было:** `refetchOnWindowFocus: true` для всех состояний job + отдельный `refetchJob()` в `MealPlanPage` при наличии id в `localStorage` → дублирующий запрос к `plan_generation_jobs` на старте.
- **Стало:** `refetchOnWindowFocus` и `refetchOnReconnect` только если в кэше job со статусом `running`; `staleTime: 20_000` мс; эффект resume с `refetchJob()` на плане удалён (первый fetch делает `useQuery`).

**Файлы:** `src/hooks/usePlanGenerationJob.ts`, `src/pages/MealPlanPage.tsx`.

---

## Сознательно не трогали (Этап 2+)

- Схлопывание `favorites` / `get_recipe_previews` / `meal_plans_v2` (несколько запросов к одной сущности).
- Глобальные политики `useSubscription`, `useMembers`, `useFavorites` на плане.
- `throttledFetch` / transport layer.

---

## Проверка вручную

1. Открыть `/meal-plan` — в Network не должно уходить три лишних запроса из ветки replace-`useRecipes` до нажатия замены.
2. Нажать замену блюда (Premium) — замена и тосты как раньше; при открытом PoolExhausted — списки могут подгрузиться.
3. Открыть «Собрать список покупок» с плана — список и позиции загружаются; сборка списка работает.
4. Запустить генерацию плана — прогресс обновляется; при уходе/возврате на вкладку при **не** running лишнего refetch job нет; при **running** — обновление возможно.

---

## Связанные документы

- Общий UX загрузки плана: `docs/dev/STARTUP_UI_AND_PLAN_LOADING.md` (раздел C).
