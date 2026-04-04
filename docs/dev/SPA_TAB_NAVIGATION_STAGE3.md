# Этап 3: меньше запросов при SPA-переходах (chat ↔ meal-plan ↔ favorites)

**Цель:** при повторном заходе на вкладку не дублировать cold-start: React Query держит данные в пределах `staleTime` и не делает лишний refetch на mount / focus окна.

**Константы:** `src/utils/reactQueryTabNav.ts` — `TAB_NAV_STALE_MS` (120 с), `TAB_NAV_USAGE_STALE_MS` (60 с).

---

## Ключевое изменение (chat)

- **`useChatRecipes`:** `useRecipes(undefined, { listQueriesEnabled: false })` — на `/chat` не поднимаются три list-query (`recipes` главная страница, `favorites`-ветка, `recent`). Нужен только `createRecipe` из мутаций.

## staleTime + refetchOnMount / refetchOnWindowFocus

| Хук / query | staleTime | Примечание |
|-------------|-----------|------------|
| `useSubscription` — `profile-subscription`, `subscription-plan` | 120 с | Лимиты/оплата обновляются через `invalidateQueries` в мутациях и `refetchUsage` |
| `useSubscription` — `usage-chat-recipe-today`, `usage-help-today` | 60 с | После сообщений в чате вызывается `refetchUsage()` |
| `useMembers` | 120 с | |
| `useFavorites` | 120 с | |
| `useRecipes` — три списка + `getRecipeById` | 120 с | |
| `useChatHistory` | 120 с | Было 30 с |
| `useRecipePreviewsByIds` | 120 с | Было 60 с |
| `useMealPlans` — неделя/день | 120 с | Было 60 с |
| `useChatRecipes` — `chat_recipes` recent | 120 с | Только если вызван `getTodayChatRecipes()` (напр. FamilyDashboard) |

Во всех перечисленных (кроме особых ниже): **`refetchOnMount: false`**, **`refetchOnWindowFocus: false`**.

## plan_generation_job

- **`refetchOnMount`:** только если в кэше `status === "running"` (чтобы не терять прогресс при возврате на план во время генерации).

---

## Ожидаемый эффект (без замера в CI)

- **Chat после первого визита:** минус **3** запроса списков `recipes` на каждый заход.
- **Любой переход между вкладками:** пока данные «свежие», повторных fetch по общим ключам нет; остаются точечные запросы (например новый `chat_history` при смене треда, первый mount без кэша).

## Не входило

- Глобальный `defaultOptions` на `QueryClient`.
- Объединение дублирующих `useRecipePreviewsByIds` в разных экранах.
- Ленивое включение `useFavorites` на meal-plan (кнопка сердца всё ещё нужна на странице).

## Связь с этапами плана

- Этап 1–2: `docs/dev/MEAL_PLAN_NETWORK_STAGE1.md`, `MEAL_PLAN_NETWORK_STAGE2.md`.
