# Источник истины: история чата (chat_history)

История чата хранится в таблице **`public.chat_history`**. Документ описывает, какой код пишет и читает эти данные.

---

## Таблица `public.chat_history`

- **Колонки:** `id`, `user_id`, `child_id`, `message`, `response`, `message_type`, `recipe_id`, `archived_at`, `created_at`, `meta` (см. миграцию).
- **Назначение:** одна строка = один обмен (user message + assistant response). `child_id` — контекст чата (null = «Семья», иначе id члена семьи).
- **RLS:** доступ только по `auth.uid() = user_id`.

Подробнее: [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) (раздел «Чат и логи»).

---

## Запись (insert)

**Кто пишет:** только клиент.

| Файл | Что делает |
|------|------------|
| `src/hooks/useDeepSeekAPI.tsx` | Мутация `saveChatMutation`: после ответа ИИ (или после blocked) вызывает `supabase.from('chat_history').insert({ user_id, child_id, message, response, message_type, recipe_id, meta })`. |

Клиент передаёт в `insert`:
- `message` — текст пользователя;
- `response` — текст ответа ассистента (или blocked message);
- `recipe_id` — если есть сохранённый рецепт (для blocked = null);
- `meta` — опционально; для blocked-ответов сюда пишется контекст follow-up: `{ blocked: true, original_query, blocked_items, suggested_alternatives, intended_dish_hint }` (см. `BlockedMeta` в `src/types/chatBlocked.ts` и вызов `saveChat` в `ChatPage.tsx`).

**Edge-функция `deepseek-chat` в БД не пишет:** она только возвращает JSON (в т.ч. blocked). Запись в `chat_history` выполняет клиент после получения ответа.

---

## Чтение (select)

**Кто читает:** клиент, для отображения истории и для follow-up после blocked.

| Файл | Что делает |
|------|------------|
| `src/hooks/useChatHistory.tsx` | `useQuery` по ключу `['chat_history', user?.id, selectedMemberId]`: `supabase.from('chat_history').select(CHAT_HISTORY_SELECT).eq('user_id', user.id).is('archived_at', null).order('created_at', { ascending: false }).limit(CHAT_LAST_MESSAGES)`. Фильтр по `child_id` в зависимости от `selectedMemberId` (family vs член). Возвращает массив записей как `messages`. |
| `src/lib/supabase-constants.ts` | `CHAT_HISTORY_SELECT` — список колонок для select (включая `meta` после миграции). |
| `src/pages/ChatPage.tsx` | Подписывается на `historyMessages` (из useChatHistory). В `useEffect` форматирует их в локальный state `messages` для рендера (в т.ч. распознаёт blocked по `response`/`meta` и выставляет `isBlockedRefusal`). |

Итого: **источник истины для «что показать в чате» — таблица `public.chat_history`**. Клиент загружает последние N записей и отображает их; новые записи добавляются только через клиентский `insert`.

---

## Дополнительное использование

- **Edge `deepseek-chat`** читает `chat_history` только для anti-duplicate: последние `recipe_id` по `user_id`/`child_id` за 14 дней, чтобы не повторять названия блюд. Запись в `chat_history` из Edge не выполняется.
- **Очистка/архивация:** `useChatHistory.tsx` — `archiveChat()` (update `archived_at`), `clearHistory()` (delete), `deleteMessage()` (delete по id).
