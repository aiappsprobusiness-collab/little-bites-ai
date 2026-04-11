# Intent scoring для чата рецептов (без LLM)

Единая точка маршрутизации для `type === "chat"` в Edge Function `deepseek-chat`: **`resolveRecipeChatIntent`** в `supabase/functions/deepseek-chat/recipeChatIntent.ts`.

## Назначение

- Заменить жёсткую цепочку «сначала Помощник, потом релевантность еды» на **параллельный скоринг** и выбор маршрута по **максимуму корзины** и **margin** (разница 1-го и 2-го места).
- Тема Помощника (`topicKey` для `/sos?scenario=`) по-прежнему берётся из **`detectAssistantTopic`** (`assistantTopicDetect.ts`) — источник правды для фраз и regex темы.

## Скоры

| Сигнал | Смысл |
|--------|--------|
| `foodScore` | Ингредиенты, глаголы готовки, контекст приёма пищи, «для ребёнка» при наличии еды |
| `recipeContextScore` | Фразы вроде «что приготовить», «рецепт», структурные паттерны (« с », « из курицы», …) |
| `recipePathScore` | `foodScore + recipeContextScore` |
| `assistantScore` | Симптомы, отказ от еды, режим/дневник/прикорм по ключам, дистресс |
| `offtopicScore` | Финансы, погода, расписания, политика/спорт/крипто и др. маркеры off-topic |

Жёсткие отсеки без скоринга: длина `< 2` символов, провал проверки доли гласных (`too_short`, `no_vowels`) → **`irrelevant`**.

## Корзины для сравнения

Сравниваются три величины с одинаковой семантикой «конкурирующее намерение»:

- **assistant** → `assistantScore`
- **offtopic** → `offtopicScore`
- **recipe** → `recipePathScore`

`margin = score(1-е место) − score(2-е место)`.

## Пороги (константы в `recipeChatIntent.ts`)

- `OFFTOPIC_STRONG_MIN` (4): сильный off-topic для отсечения при лидерстве корзины offtopic.
- `ASSISTANT_WIN_MIN` (5): минимальный балл assistant при уверенной победе корзины assistant.
- `MARGIN_MIN` (2): минимальная маржа для «жёсткого» класса; иначе срабатывает **fail-open** (см. ниже).

## Исходы

1. **`irrelevant`** — явный off-topic (лидер корзины offtopic при достаточном балле и марже) или порог по off-topic при победе этой корзины; также жёсткие `too_short` / `no_vowels`.
2. **`assistant_topic`** — победа корзины assistant при достаточной марже и **`detectAssistantTopic.matched`**; при низкой марже: если тема совпала и `assistantScore >= recipePathScore`, тоже редирект в Помощник.
3. **`recipe`** — победа корзины recipe, либо **fail-open** при `margin < 2` (если не сработало правило low-margin + тема Помощника выше), либо assistant-баллы без матча темы.

## Логи

- `CHAT_INTENT` — `route`, `reason`, `scores`, `margin`, `winner`, `topicKey` (если есть).
- `CHAT_ROUTE` — `assistant_topic` | `irrelevant` | `recipe`.
- `FOOD_RELEVANCE` — совместимость: `relevance_result` по `intent.route`.

## Клиент

- Клиент: `src/utils/chatRouteFallback.ts` вызывает **`resolveRecipeChatIntent`** (импорт из `supabase/functions/deepseek-chat/recipeChatIntent.ts`) — те же правила, что на Edge. При маршруте не `recipe` чат рецептов в **`ChatPage`** отвечает **без вызова Edge** (без индикатора «генерация рецепта»), см. `chat_recipe_generation.md`.
- Восстановление истории: в `ChatPage` для ответа нерелевантности учитываются характерные подстроки (в т.ч. старый текст «В этом чате мы помогаем…» и новый из `CHAT_MESSAGE_IRRELEVANT` в `_shared/chatRecipeRoutingMessages.ts`).

## Тесты

- Edge (Deno): `supabase/functions/deepseek-chat/recipeChatIntent.test.ts`, `isRelevantQuery.test.ts`, `assistantTopicDetect.test.ts`.
- Полный набор: `npm run test:edge` (нужен [Deno](https://deno.land/) в `PATH`).
- Только intent + релевантность + темы Помощника без глобального Deno: `npm run test:edge:chat-intent` (использует `npx deno@2.2.0` и `--no-lock` из-за версии `deno.lock` в репозитории).

## Словари тем Помощника

Расширяемые phrase bank / keywords / regex для `detectAssistantTopic` лежат в **`supabase/functions/deepseek-chat/assistantTopicDetect.ts`** (источник правды на Edge). Клиентский fallback — **`src/utils/chatRouteFallback.ts`** (подмножество ключей). Периодически синхронизировать при добавлении разговорных формулировок (кожа, стул, отказ от еды и т.д.).

## Связанные документы

- `docs/architecture/chat_recipe_generation.md` §3.2–3.3
