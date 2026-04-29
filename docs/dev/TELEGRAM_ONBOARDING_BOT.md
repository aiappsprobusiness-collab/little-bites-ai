# Telegram onboarding bot — запуск и деплой

## Что реализовано

- Edge webhook-функция: `supabase/functions/telegram-onboarding/`.
- Хранение состояния диалога: `public.telegram_onboarding_sessions` (в т.ч. `prompt_message_id` для обновления чипов и **`menu_example_delivered`** после первой успешной выдачи превью).
- Опрос как на `/vk`: пресеты возраста, мультивыбор аллергий / лайков / дизлайков через **inline keyboard** (`callback_data`) + «Далее →». Тексты приветствия, шагов и финала задаются в `orchestrate.ts` (короткий «живой» тон; логика и чипы не меняются).
- Подбор превью: reuse `vk-preview-plan` (`buildVkPreviewDayPlan`). Фильтры **аллергий и dislikes** совпадают с generate-plan (`passesPreferenceFilters`: расширение чипов dislike, категории ингредиентов, см. `docs/decisions/PREFERENCES_LIKES_DISLIKES.md`). Для слота **обед** сначала ищутся только **супы** из каталога; если из‑за аллергий/dislikes ни один не подошёл — превью подставляет любое подходящее блюдо с типом обед из БД (см. `docs/decisions/MEAL_TYPE_AND_LUNCH_SOUP.md`). Ответы AI на пустые слоты и mock-заглушки проходят ту же проверку; mock — только конкретные названия блюд, без «лёгкий обед» / «нежное блюдо». Промпт к AI явно запрещает общие формулировки вместо названия блюда.
- **Финал (первый успешный превью в этом чате):** текст с меню на день (4 приёма) + скорость + вопрос «Хочешь не думать…» + блок **«В приложении я могу:»** … **«👇 всё это есть в приложении»**. Генерация превью **только** если в счётчике ещё не было успешной выдачи меню (`meals.length > 0`); затем выставляется **`menu_example_delivered`**.
- **Финал (повторно для этого чата после успешной первой генерации):** короткий текст о том, что пример уже показывали, предложение продолжить в приложении, **та же одна кнопка** **«Открыть приложение»** (без второго запроса `vk-preview-plan`). Поле хранится в БД между `/start`; легаси `again`/`restart` сбрасывают только шаги анкеты, флаг сохраняется.
- **Одна** inline-кнопка **`/tg-start`** как выше (см. атрибуцию ниже); кнопок по слотам рецептов в финале **нет**.
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

**Генерация `t.me/...?start=...` для блогеров (без сайта):** веб-форма в админке — `docs/dev/TELEGRAM_BLOGGER_LINKS.md` (маршрут `/admin/telegram-blogger-links`).

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
5. В БД проверить, что появилась/обновилась строка в `telegram_onboarding_sessions`; после первого успеха — `menu_example_delivered = true`.
6. Снова `/start`, пройти опрос → короткий финал без второго профиля дня превью, кнопка та же.

## Почему казалось, что бот «висит», и как проверить

- **Индикатор загрузки на inline-кнопке** в Telegram исчезает только после **`answerCallbackQuery`**. Если сначала выполнять тяжёлую работу (превью: БД + при нехватке слотов до **8 с** вызов DeepSeek в `vk-preview-plan`), пользователь видит «залипание» на **«Далее →»** и между шагами.
- **В коде:** на каждый `callback` сначала вызывается `answerCallbackQuery` (на последнем шаге — «Подбираю меню…»), затем превью и отправка финала с CTA.
- **Проверка:** Supabase → Edge Functions → `telegram-onboarding` → **Logs** (ошибки `sendMessage`, ответы Telegram). Локально: `npm run test:edge:telegram-onboarding`.

## Повтор прохождения

- Отдельной кнопки «Заново» на промежуточных шагах нет. **Сброс сценария:** команда **`/start`**. После уже показанного примера меню пользователь может снова пройти опрос; финальный ответ будет сокращённым (без новой генерации дня).

---

## История изменений (кратко)

| Дата | Изменение |
|------|-----------|
| 2026-04 | Ограничение повторной генерации: после первого успешного превью — короткий CTA без `vk-preview-plan`; `menu_example_delivered` в `telegram_onboarding_sessions`. |
| 2026-04 | Копирайт: приветствие («10 секунд»), вопросы аллергий/лайков/дизлайков, финальный блок («В приложении я могу:» + буллеты про ребёнка, отказы, рецепты по запросу, меню семьи); без смены FSM. |
| 2026-04 | Финал: кнопка «Открыть приложение» → `/tg-start` (лайт-signup, без имени) + `mode=signup` и UTM/entry_point; холодный трафик — `/auth`. |
| 2026-04 | Тизер рецептов для других сценариев остаётся на фронте `/t/:id` (не в финале бота). |
| 2026-04 | `/tg-start`: копирайт без переноса анкеты в аккаунт; акцент на полном приложении после регистрации. |
| 2026-04 | Админ-страница `/admin/telegram-blogger-links`: генерация ссылок на бота с `blogger_id` / UTM в `start` (см. `docs/dev/TELEGRAM_BLOGGER_LINKS.md`); таблица `public.telegram_bloggers` |
