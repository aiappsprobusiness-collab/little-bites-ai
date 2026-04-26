# Telegram onboarding bot — запуск и деплой

## Что реализовано

- Edge webhook-функция: `supabase/functions/telegram-onboarding/`.
- Хранение состояния диалога: `public.telegram_onboarding_sessions`.
- Подбор превью: reuse `vk-preview-plan` доменной логики (`buildVkPreviewDayPlan`).
- CTA после опроса: `/auth?mode=signup&entry_point=telegram` (+ UTM/blogger, если есть).

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
