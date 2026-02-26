# Поведение чата при блокировке запроса (аллергия / dislikes)

Когда запрос пользователя содержит ингредиент, запрещённый профилем (аллергия или «не любит»), рецепт не генерируется. Ответ — обычное текстовое сообщение, без карточки рецепта. Лимиты (Free/Trial) при этом не списываются.

## Единый формат ответа «blocked»

И клиентский pre-check, и Edge (deepseek-chat) возвращают один и тот же формат:

```ts
type ChatBlockedResponse = {
  blocked: true;
  blocked_by: "allergy" | "dislike";
  profile_name: string;
  matched: string[];   // что нашли (например ["курица"], ["лук"])
  message: string;    // готовый текст для UI
};
```

- **blocked** — всегда `true` для такого ответа.
- **blocked_by** — причина: аллергия или «не любит».
- **profile_name** — имя профиля (или «выбранного профиля» / «Семья»).
- **matched** — список для отображения пользователю (названия аллергенов или пунктов из dislikes).
- **message** — итоговый текст с причиной и подсказкой «Попробуйте заменить на: …».

Ответ отдаётся со статусом **200** (не ошибка).

## Где проверяется

1. **Клиент (pre-check)** — до вызова Edge:
   - `checkChatRequestAgainstProfile({ text, member })` в `src/utils/chatBlockedCheck.ts`.
   - Использует `member.allergies` (через `buildBlockedTokens`) и `member.dislikes` (через `getDislikeTokens`).
   - Если матч — возвращается `ChatBlockedResponse`, **Edge не вызывается** → лимит не списывается.

2. **Edge (страховка)** — в `supabase/functions/deepseek-chat/index.ts`:
   - После сборки контекста (allergies/dislikes по профилю/семье), до вызова модели.
   - Если в `userMessage` есть токены аллергий или dislikes:
     - возвращается JSON `ChatBlockedResponse` со статусом 200;
     - модель **не вызывается**;
     - парсер рецепта **не запускается**;
     - в **usage_events** ничего **не пишется** (инкремент только после успешной генерации рецепта).

## UI

- При `response.blocked === true` (или legacy `blockedByAllergy` / `blockedByDislike`) сообщение ассистента рендерится как **обычный текстовый пузырь**.
- **Карточка рецепта не показывается** (`preParsedRecipe: null`).
- Состояние «ИИ уточняет состав…» показывается только пока реально идёт стрим генерации (не при blocked).

## Лимиты и учёт

- **Pre-check на клиенте:** запрос в Edge не отправляется → **ничего не списывается**.
- **Blocked на Edge:** ответ отдаётся до вызова модели и до кода, который пишет в `usage_events` → **usage не инкрементится**, событие `chat_recipe` не создаётся.
- Инкремент usage (и запись в `usage_events`) выполняется только после **успешной** генерации рецепта (когда есть `responseRecipes.length > 0`).

## Текст сообщения пользователю

Формат:

- Первая строка: «У профиля «{profile_name}» указано: {аллергия | не любит} — {items}. Поэтому рецепт с этим ингредиентом я не предложу.»
- Вторая строка (опционально): «Попробуйте заменить на: {до 3 альтернатив}.»

Альтернативы задаются в коде (клиент: `src/types/chatBlocked.ts`, Edge: inline в deepseek-chat) по ключевым словам (курица → индейка, говядина, рыба; лук → чеснок, зелень, сладкий перец и т.д.).

## Файлы

| Назначение              | Файл |
|-------------------------|------|
| Тип и сообщение blocked | `src/types/chatBlocked.ts` |
| Pre-check (allergy + dislike) | `src/utils/chatBlockedCheck.ts` |
| Токены dislikes        | `src/utils/dislikeTokens.ts` |
| Вызов pre-check, ответ | `src/hooks/useDeepSeekAPI.tsx` |
| Рендер (без карточки)   | `src/pages/ChatPage.tsx` |
| Edge страховка, ответ   | `supabase/functions/deepseek-chat/index.ts` |

## Тесты

- **Front (unit):** `src/utils/chatBlockedCheck.test.ts` — проверка `checkChatRequestAgainstProfile`: при аллергии/dislike в тексте возвращается `ChatBlockedResponse` с `blocked: true` и нужным `blocked_by`; при отсутствии матча — `null`. При блокировке клиент не вызывает Edge → лимит не списывается (проверяется косвенно: при pre-check блокировки вызов `chat()` возвращает объект без запроса к API).
- **Edge:** при запросе с токеном аллергии/dislike обработчик возвращает 200 и JSON с `blocked: true` до вызова модели; запись в `usage_events` выполняется только после успешной генерации рецепта (см. код в deepseek-chat).
