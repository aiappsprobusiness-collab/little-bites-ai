# Telegram onboarding bot — запуск и деплой

## Что реализовано

- Edge webhook-функция: `supabase/functions/telegram-onboarding/`.
- Хранение состояния диалога: `public.telegram_onboarding_sessions` (в т.ч. `prompt_message_id` для обновления чипов).
- Опрос как на `/vk`: пресеты возраста, мультивыбор аллергий / лайков / дизлайков через **inline keyboard** (`callback_data`) + «Далее →».
- Подбор превью: reuse `vk-preview-plan` (`buildVkPreviewDayPlan`); у блюд из БД в ответе есть `recipe_id` для deeplink.
- Финальное сообщение: заголовок + **4 строки приёмов** (завтрак / обед / ужин / перекус) + одна CTA-строка без URL в тексте. Inline-кнопки: по слотам «Завтрак» … «Перекус» → **`/t/:recipe_id`** (публичный тизер; не `/recipe/:id` — он за `ProtectedRoute` и ведёт гостя на `/auth`). Старый путь `/recipe/teaser/:id` на фронте редиректит на `/t/:id`.
- На шагах с чипами **«Нет»** (`al_none` / `li_none` / `di_none`, отдельная строка клавиатуры) сразу переводит к следующему вопросу и очищает выбор; легаси `*:clear` на старых сообщениях тоже обрабатывается.

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
3. Проверить, что бот прислал превью меню и кнопку CTA.
4. Открыть CTA и убедиться, что в URL есть `entry_point=telegram`.
5. В БД проверить, что появилась/обновилась строка в `telegram_onboarding_sessions`.

## Почему казалось, что бот «висит», и как проверить

- **Индикатор загрузки на inline-кнопке** в Telegram исчезает только после **`answerCallbackQuery`**. Если сначала выполнять тяжёлую работу (превью: БД + при нехватке слотов до **8 с** вызов DeepSeek в `vk-preview-plan`), пользователь видит «залипание» на **«Далее →»** и между шагами.
- **В коде:** на каждый `callback` сначала вызывается `answerCallbackQuery` (на последнем шаге — «Подбираю меню…»), затем превью и отправка финала с CTA.
- **Проверка:** Supabase → Edge Functions → `telegram-onboarding` → **Logs** (ошибки `sendMessage`, ответы Telegram). Локально: `npm run test:edge:telegram-onboarding`.

## Повтор прохождения

- Отдельной кнопки «Заново» на промежуточных шагах нет. **Сброс сценария:** команда **`/start`** или финальная кнопка **«Посмотреть ещё рецепты»** (`again`; для совместимости также обрабатывается `restart`).
