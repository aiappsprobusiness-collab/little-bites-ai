# Telegram onboarding bot — запуск и деплой

## Что реализовано

- Edge webhook-функция: `supabase/functions/telegram-onboarding/`.
- Хранение состояния диалога: `public.telegram_onboarding_sessions` (в т.ч. `prompt_message_id` для обновления чипов).
- Опрос как на `/vk`: пресеты возраста, мультивыбор аллергий / лайков / дизлайков через **inline keyboard** (`callback_data`) + «Далее →». Тексты приветствия, шагов и финала задаются в `orchestrate.ts` (короткий «живой» тон; логика и чипы не меняются).
- Подбор превью: reuse `vk-preview-plan` (`buildVkPreviewDayPlan`). Фильтры **аллергий и dislikes** совпадают с generate-plan (`passesPreferenceFilters`: расширение чипов dislike, категории ингредиентов, см. `docs/decisions/PREFERENCES_LIKES_DISLIKES.md`). Ответы AI на пустые слоты и mock-заглушки проходят ту же проверку; mock выбирается из списка кандидатов, совместимых с профилем.
- **Финал:** текст с меню на день (4 приёма) + блоки ценности и оффера; **одна** inline-кнопка **«Открыть приложение»** → **`/tg-start`** (лайт-signup после бота) с параметрами атрибуции (см. ниже). Кнопок по слотам рецептов и «Посмотреть ещё рецепты» в финале **нет** (повтор сценария — **`/start`**; легаси `again` / `restart` в коде по-прежнему обрабатываются, если пользователь жмёт старую кнопку).
- На шагах с чипами **«Нет»** (`al_none` / `li_none` / `di_none`, отдельная строка клавиатуры) сразу переводит к следующему вопросу и очищает выбор; легаси `*:clear` на старых сообщениях тоже обрабатывается.

## Финальная ссылка на `/tg-start` и аналитика

Цель: видеть в продуктовой аналитике регистрации/сессии, пришедшие **из финальной CTA бота**, без передачи анкеты в URL.

**В ссылке передаётся только неперсональное:**

| Параметр | Назначение |
|----------|------------|
| `mode=signup` | Маркер воронки регистрации; на `/tg-start` открывается лайт-форма (email + пароль, без имени). |
| `entry_point=telegram` | Канал прихода; пишется в `localStorage` (`captureAttributionFromLocationOnce` → `last_touch_entry_point`). |
| `utm_source` | По умолчанию `telegram`, если в deep-link `/start` не задан другой `utm_source`. |
| `utm_medium` | По умолчанию `onboarding_bot`, если в `/start` не передан свой `utm_medium`. |
| `utm_content` | По умолчанию `menu_day_final` — метка **именно финальной кнопки** после превью дня; если в `/start` уже есть `utm_content`, он **не перезаписывается**. |
| `utm_campaign`, `utm_term`, `blogger_id` | Пробрасываются из payload `/start`, если пользователь зашёл по реф-ссылке блогера. |

**Не передаётся:** возраст, аллергии, лайки, дизлайки и любые ответы опроса.

**Страница `/tg-start` (копирайт):** не обещает перенос анкеты из бота в аккаунт — ответы опроса в профиль приложения **не** подставляются и перенос не планируется; текст ведёт к регистрации как к полному функционалу приложения. Источник строк: `src/pages/TelegramStartPage.tsx`.

Реализация URL: `buildTelegramOnboardingFinalAuthUrl` в `supabase/functions/telegram-onboarding/cta.ts`. На клиенте атрибуция из query подхватывается при открытии `/tg-start` (`TelegramStartPage` → `captureAttributionFromLocationOnce`) и далее попадает в события `usage_events` согласно `src/utils/usageEvents.ts`. Классическая регистрация с сайта по-прежнему на **`/auth`**.

Подробнее про слой событий: `docs/analytics/analytics-system.md` (раздел про Telegram onboarding CTA).

## Переменные окружения (Supabase project secrets)

Задать в проекте Supabase:

- `TELEGRAM_BOT_TOKEN` — токен от BotFather.
- `APP_BASE_URL` — базовый URL веба (например `https://momrecipes.online`).
- `TELEGRAM_WEBHOOK_SECRET` — случайная строка для `secret_token` webhook (рекомендуется).
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — стандартные для edge-функций.

## Локальные тесты

- Запуск unit-тестов:
  - `npm run test:edge:telegram-onboarding`
  - `npm run test:edge:vk-preview`

## Деплой

1. Применить миграции БД (`supabase db push` или штатный pipeline миграций проекта).
2. Задеплоить функцию:
   - `npm run supabase:deploy:telegram-onboarding`

## Настройка webhook в Telegram

После деплоя вызвать Telegram Bot API:

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"https://<PROJECT_REF>.functions.supabase.co/telegram-onboarding\",\"secret_token\":\"<TELEGRAM_WEBHOOK_SECRET>\"}"
```

Проверка webhook:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"
```

## Smoke-check после деплоя

1. Написать боту `/start`.
2. Пройти 4 шага опроса.
3. Проверить финальный текст (4 приёма + блоки про скорость и приложение).
4. Нажать **«Открыть приложение»** → `/tg-start?mode=signup&entry_point=telegram&utm_source=…&utm_medium=…&utm_content=…` (значения см. таблицу выше).
5. В БД проверить, что появилась/обновилась строка в `telegram_onboarding_sessions`.

## Почему казалось, что бот «висит», и как проверить

- **Индикатор загрузки на inline-кнопке** в Telegram исчезает только после **`answerCallbackQuery`**. Если сначала выполнять тяжёлую работу (превью: БД + при нехватке слотов до **8 с** вызов DeepSeek в `vk-preview-plan`), пользователь видит «залипание» на **«Далее →»** и между шагами.
- **В коде:** на каждый `callback` сначала вызывается `answerCallbackQuery` (на последнем шаге — «Подбираю меню…»), затем превью и отправка финала с CTA.
- **Проверка:** Supabase → Edge Functions → `telegram-onboarding` → **Logs** (ошибки `sendMessage`, ответы Telegram). Локально: `npm run test:edge:telegram-onboarding`.

## Повтор прохождения

- Отдельной кнопки «Заново» на промежуточных шагах нет. **Сброс сценария:** команда **`/start`**. (Легаси-колбэки `again` / `restart` на старых сообщениях по-прежнему сбрасывают сессию.)

---

## История изменений (кратко)

| Дата | Изменение |
|------|-----------|
| 2026-04 | Копирайт: приветствие («10 секунд»), вопросы аллергий/лайков/дизлайков, финальный блок («ест в приложении»); без смены FSM. |
| 2026-04 | Финал: кнопка «Открыть приложение» → `/tg-start` (лайт-signup, без имени) + `mode=signup` и UTM/entry_point; холодный трафик — `/auth`. |
| 2026-04 | Тизер рецептов для других сценариев остаётся на фронте `/t/:id` (не в финале бота). |
| 2026-04 | `/tg-start`: копирайт без переноса анкеты в аккаунт; акцент на полном приложении после регистрации. |
