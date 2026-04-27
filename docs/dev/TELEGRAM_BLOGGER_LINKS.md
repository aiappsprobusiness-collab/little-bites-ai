# Ссылки на бота для блогеров (атрибуция)

## Зачем это

Блогер публикует **ссылку на Telegram-бота** (`t.me/...?start=...`), а не на сайт. Параметр `start` разбирает онбординг-бот (`parseStartUtm` в `supabase/functions/telegram-onboarding/orchestrate.ts`); дальше метки уходят в финальную CTA на веб и в `usage_events` (см. `docs/dev/TELEGRAM_ONBOARDING_BOT.md`).

## Таблица `public.telegram_bloggers`

Справочник: короткий **код** (= `blogger_id` в ссылке) и человекочитаемое **имя** (для вас). RLS: как у `marketing_links` — `anon`/`authenticated` могут SELECT/INSERT/UPDATE/DELETE (защита пути админки на фронте `VITE_ADMIN_MODE`, при необходимости ограничьте хост). Миграция: `20260428120000_telegram_bloggers.sql`. См. [DATABASE_SCHEMA.md](../database/DATABASE_SCHEMA.md).

**Применить миграции на проект Supabase** (с машины с CLI и линком к проекту):

```bash
npx supabase db push
```

(или ваш CI, который катает `supabase/migrations/`.)

## Первая ссылка: пошагово

1. **Переменные фронта** (уже в `.env` / секретах сборки, не в репозитории):
   - `VITE_ADMIN_MODE=true`
   - `VITE_TELEGRAM_BOT_USERNAME=YourBot` — username бота **без** символа `@` (как в `t.me/YourBot`).
2. **Собрать и выкатить** фронт на `https://momrecipes.online` (commit + push в репозиторий, если деплой через GitHub Pages / ваш pipeline).
3. **База:** убедиться, что миграция `telegram_bloggers` применена (`db push` выше), иначе список блогеров в админке не загрузится.
4. Открыть: **`https://momrecipes.online/admin/telegram-blogger-links`**
5. **Добавить в базу** блогера: поле *Код* (например `first_01`) и *Имя* (любой текст для себя) → «Добавить в базу».
6. Нажать **«В ссылку»** у строки **или** выбрать в «Быстро: выбрать код из базы», **или** вручную вписать `blogger_id` в форме «Собрать ссылку».
7. **«Скопировать ссылку»** — готовый `https://t.me/...?start=...` для публикации у блогера.

Без `VITE_TELEGRAM_BOT_USERNAME` блок с итоговой ссылкой пустой (нельзя подставить `t.me/...`).

Лимит длины `start` в Telegram: **~64 байта (UTF-8)** — в форме показывается счётчик; используйте короткий `code` (латиница, цифры, `_`).

**Почему не внутри бота?** В чате нет удобной панели; веб-форма + копирование. Список полей в `start` — как в `parseStartUtm` (`blogger_id`, `utm_*`).

## Маркетинг-ссылки на сайт

Отдельно: **Marketing links** (`/admin/marketing-links`) ведут на **сайт** через `/go/:slug` — это не `t.me`.

## Связанные файлы

- Сборка ссылки: `src/utils/telegramBloggerLink.ts`
- CRUD справочника: `src/utils/telegramBloggersDb.ts`
- Страница: `src/pages/admin/TelegramBloggerLinksPage.tsx`
