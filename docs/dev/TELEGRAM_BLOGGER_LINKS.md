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

## Где задать `VITE_ADMIN_MODE` и `VITE_TELEGRAM_BOT_USERNAME`

Это **не** настройки Supabase Edge и **не** один только локальный файл: Vite **вшивает** значения в бандл **в момент** `npm run build`. Нужны **два места** — в зависимости от того, откуда собираете.

### 1) Локально (разработка и ручной прод-билд)

- Файл **`.env`** (или `.env.production` при `npm run build`) **в корне репозитория** — см. [`.env.example`](../../.env.example).
- После **каждого** изменения переменных: снова `npm run build` (или `npm run dev` для dev).

**В репозиторий `.env` не коммитится** (в `.gitignore`).

### 2) Прод: GitHub → Actions → GitHub Pages (текущий pipeline проекта)

Файла `.env` **на сервере GitHub нет**. Сборка идёт из [`.github/workflows/pages.yml`](../../.github/workflows/pages.yml): в шаге **Build** в окружение подставляются **секреты** репозитория.

**Что сделать вручную (один раз):**

1. Репозиторий на GitHub → **Settings** → **Secrets and variables** → **Actions**.
2. **New repository secret** — добавить:
   - **`VITE_ADMIN_MODE`** — значение: `true` (чтобы открылись маршруты `/admin/...` на momrecipes.online).
   - **`VITE_TELEGRAM_BOT_USERNAME`** — username бота **без** `@` (как в ссылке `t.me/YourBot`).
3. Сохранить. **Запустить новую сборку:** любой `push` в `main` или **Actions** → **Deploy to GitHub Pages (Vite)** → **Run workflow** (уже есть `workflow_dispatch`).

Пока эти секреты **не** заданы, в артефактах с CI переменные будут пустыми → на проде админка ссылок на бота **не** заработает, даже если у вас всё прописано только в **локальном** `.env`.

(Рядом в секретах уже лежат `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY` — их не трогайте.)

### Кратко

| Где вы собираете фронт | Куда писать переменные |
|------------------------|-------------------------|
| У себя на ПК            | Локальный `.env`        |
| Автосборка на GitHub   | **Repository secrets**  |

## Первая ссылка: пошагово (после настройки переменных на проде)

1. **База:** миграция `telegram_bloggers` применена к проекту Supabase (`npx supabase db push` или уже применена).
2. **Секреты GitHub** (см. выше) заданы, **сборка** прошла на `main` (после push или ручного запуска workflow).
3. Открыть: **`https://momrecipes.online/admin/telegram-blogger-links`**
4. **Добавить в базу** блогера: *Код* (например `first_01`) и *Имя* → «Добавить в базу».
5. **«В ссылку»** / выпадающий список / вручную `blogger_id` → **«Скопировать ссылку»**.

Без **секрета** `VITE_TELEGRAM_BOT_USERNAME` (или пустого значения после сборки) блок с итоговой ссылкой не соберёт `t.me/...` — **потому что** в бандл не попал username бота.

Лимит длины `start` в Telegram: **~64 байта (UTF-8)** — в форме показывается счётчик; используйте короткий `code` (латиница, цифры, `_`).

**Почему не внутри бота?** В чате нет удобной панели; веб-форма + копирование. Список полей в `start` — как в `parseStartUtm` (`blogger_id`, `utm_*`).

## Маркетинг-ссылки на сайт

Отдельно: **Marketing links** (`/admin/marketing-links`) ведут на **сайт** через `/go/:slug` — это не `t.me`.

## Связанные файлы

- Сборка ссылки: `src/utils/telegramBloggerLink.ts`
- CRUD справочника: `src/utils/telegramBloggersDb.ts`
- Страница: `src/pages/admin/TelegramBloggerLinksPage.tsx`
