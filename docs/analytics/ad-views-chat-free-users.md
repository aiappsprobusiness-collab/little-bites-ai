# Просмотры рекламы у фри-пользователей во вкладке «Чат»

Подробное описание реализации: где код, условия показа, лимиты и поток.

---

## Где реализовано

| Часть | Файл |
|-------|------|
| Условие показа и вызов провайдера | `src/pages/ChatPage.tsx` (в `handleSend`, ~558–568) |
| Интерфейс провайдера рекламы | `src/services/ads/RewardedAdProvider.ts` |
| Текущая реализация (stub) | `src/services/ads/StubRewardedAdProvider.ts` |
| Лимиты и счётчик использований | `src/hooks/useSubscription.tsx`, `src/utils/subscriptionRules.ts`, бэкенд `supabase/functions/deepseek-chat/index.ts` |

---

## Условие показа рекламы

Реклама показывается **только если одновременно**:

- **Режим чата** — `mode === "recipes"` (вкладка «Рецепты», не «Помощь маме»).
- **Пользователь без доступа** — `!hasAccess` (нет trial и не premium).
- **Уже была хотя бы одна генерация сегодня** — `usedToday >= 1`.

Итого: **первая генерация в день — без рекламы, со второй — перед отправкой запроса показываем рекламу.**

Фрагмент в `ChatPage.tsx`:

```ts
if (mode === "recipes" && !hasAccess && usedToday >= 1) {
  const adProvider = (await import("@/services/ads/StubRewardedAdProvider").then((m) => m.getRewardedAdProvider()));
  if (adProvider.isAvailable()) {
    try {
      await adProvider.show();
    } catch {
      sendInProgressRef.current = false;
      return;
    }
  }
}
```

- Проверка выполняется **до** добавления сообщения в UI и вызова API.
- Провайдер подгружается динамически (`import("@/services/ads/StubRewardedAdProvider")`).
- Если `adProvider.show()` завершается с ошибкой (например, пользователь закрыл модалку без «Продолжить») — `sendInProgressRef.current = false` и отправка **не выполняется** (return).
- Если `show()` успешно завершился — дальше идёт обычная логика отправки (добавление сообщения, вызов чата и т.д.).

---

## Откуда берётся `usedToday` для free

В `useSubscription.tsx` для **free** используется не `profiles_v2.requests_today`, а счётчик по фиче `chat_recipe` из `usage_events`:

- Запрос к БД: RPC `get_usage_count_today` с `p_feature: "chat_recipe"`.
- Ключ запроса: `["usage-chat-recipe-today", user?.id]`.
- Запрос включён только для free: `enabled: !!user && (profileV2 == null || profileV2.status === "free")`.

В итоге `usedToday` для free = число записей в `usage_events` за сегодня с `feature = 'chat_recipe'`. Это же число проверяется на бэкенде перед генерацией.

---

## Лимиты для free (правила и бэкенд)

- В `src/utils/subscriptionRules.ts`: у free задано `aiDailyLimit: 2` (2 AI-запроса в день в режиме рецептов).
- На бэкенде в `deepseek-chat/index.ts` для типа `chat`/`recipe` у не-premium пользователя проверяется лимит по той же фиче `chat_recipe` и константе `FREE_FEATURE_LIMIT = 2`: если `used >= FREE_FEATURE_LIMIT`, возвращается 429 и запрос не выполняется. После успешной генерации в `usage_events` пишется событие с `feature: "chat_recipe"`.

Итого: **реклама не увеличивает лимит** — она лишь обязательный шаг перед второй генерацией в день; лимит по-прежнему 2 запроса в день, учёт только по `usage_events.chat_recipe`.

---

## Интерфейс провайдера рекламы

В `RewardedAdProvider.ts`:

- `isAvailable(): boolean | Promise<boolean>` — можно ли показать рекламу.
- `show(): Promise<void>` — показать рекламу; `resolve` — пользователь получил награду (досмотрел/нажал «Продолжить»), `reject` — отмена или ошибка.

В чате используется только факт успешного `show()`: после него отправка продолжается; при `reject` отправка отменяется.

---

## Stub-реализация (StubRewardedAdProvider)

Сейчас не показывается реальная реклама, а показывается модальное окно:

- Текст: «Посмотрите короткое видео» и «чтобы открыть генерацию».
- Кнопка «Продолжить».
- Оверлей на весь экран (z-index 9999), клик по затемнению закрывает модалку.

События аналитики (через `trackUsageEvent` из `@/utils/usageEvents`):

- `ad_rewarded_shown` — модалка показана.
- `ad_rewarded_completed` — пользователь нажал «Продолжить» (в коде после этого вызывается `resolve()`).
- `ad_rewarded_dismissed` — закрыл по клику на оверлей (после этого `reject(new Error("cancelled"))`).

Комментарий в коде: в проде этот stub нужно заменить на реальный AdMob/Unity Rewarded. Провайдер задаётся через `getRewardedAdProvider()` / `setRewardedAdProvider()` в том же файле.

---

## Порядок действий при нажатии «Отправить» (free, режим рецептов)

1. Проверка `canGenerate` / paywall: если лимит уже исчерпан — показ paywall, отправка не идёт.
2. Если `mode === "recipes" && !hasAccess && usedToday >= 1` — загрузка провайдера, проверка `isAvailable()`, вызов `await adProvider.show()`. При ошибке/reject — выход без отправки.
3. Трекинг `chat_generate_click`.
4. Добавление сообщения пользователя и плейсхолдера ответа, вызов API чата (deepseek-chat). На бэкенде снова проверяется лимит по `chat_recipe` и при успехе в `usage_events` пишется ещё одно использование.

Таким образом, просмотры рекламы для фри-пользователей во вкладке чат реализованы как обязательный шаг перед второй (и последующей в тот же день) генерацией в режиме «Рецепты», с учётом лимита 2 запроса в день по `usage_events.chat_recipe` и stub-модалкой с аналитикой `ad_rewarded_*`.
