# OG-preview для ссылок /r/:shareRef

Каноническая ссылка шаринга: `https://momrecipes.online/r/:shareRef`. Чтобы в Telegram/WhatsApp и других сервисах показывалось превью рецепта (og:title, og:description, og:image), боты должны получать HTML с OG-тегами, а не SPA.

## Как это устроено

- **Edge Function `share-og`** (Supabase): по `GET ?ref=:shareRef` отдаёт HTML с og:title, og:description, og:image, og:url и делает редирект на `/recipe/:id`.
- **Фронт (SPA)**: маршрут `/r/:shareRef` (ShareRedirectPage) при открытии в браузере редиректит на `/recipe/:id`.

Если фронт отдаётся как статика (GitHub Pages / GitHub Actions → статический хостинг), то запрос `GET https://momrecipes.online/r/Abc123` от бота получает один и тот же `index.html` для всех путей — без рецепт-специфичных OG. Поэтому нужен **прокси**: запросы на `/r/*` должны отдаваться с сервера, который вернёт ответ Edge Function.

## Хостинг через GitHub Actions + свой домен

Статика обычно деплоится в GitHub Pages или в другой CDN/хостинг. Чтобы OG работало для `/r/:shareRef`, нужно на уровне **перед фронтом** отдавать для пути `/r/*` ответ от Edge Function.

### Вариант 1: Cloudflare (перед сайтом)

Если домен на Cloudflare (DNS или полный proxy):

- **Cloudflare Worker**: для `https://momrecipes.online/r/*` вызывать Edge Function и возвращать её ответ (статус 200, body HTML). URL функции: `https://<PROJECT_REF>.supabase.co/functions/v1/share-og?ref=<shareRef>`.
- Либо **Transform Rules** / **Page Rule** с proxy к внешнему URL, если ваш тариф это поддерживает.

Пример логики Worker (псевдокод):

```js
// path: /r/Abc123 → fetch('https://PROJECT.supabase.co/functions/v1/share-og?ref=Abc123')
const ref = new URL(request.url).pathname.replace(/^\/r\//, '');
const ogUrl = `${SUPABASE_URL}/functions/v1/share-og?ref=${encodeURIComponent(ref)}`;
const res = await fetch(ogUrl);
return new Response(res.body, { status: res.status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
```

### Вариант 2: Обратный прокси (nginx / Caddy / VPS)

Если фронт отдаётся через свой сервер (nginx/Caddy за GitHub Actions или отдельный VPS):

- Правило: при `GET /r/:shareRef` проксировать запрос на `https://<PROJECT_REF>.supabase.co/functions/v1/share-og?ref=:shareRef` и отдавать ответ клиенту (200, text/html).
- URL в браузере остаётся `https://momrecipes.online/r/Abc123`.

### Вариант 3: Без прокси (временно)

Пока прокси не настроен:

- В шаринге можно вставлять прямую ссылку на Edge Function: `https://<PROJECT_REF>.supabase.co/functions/v1/share-og?ref=:shareRef`. Тогда превью будет работать, но ссылка будет длинной и не на свой домен.
- Рекомендуется всё же настроить прокси на `/r/*` к этой функции, чтобы каноническая ссылка оставалась `https://momrecipes.online/r/:shareRef`.

## Деплой Edge Function

```bash
npm run supabase:deploy:share-og
```

Переменные окружения в Supabase (обычно уже есть): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

---

# OG-preview для ссылок /p/:ref (план питания на день)

Каноническая ссылка: `https://momrecipes.online/p/:ref`. Чтобы в Telegram/WhatsApp показывалась превью карточка, запросы от краулеров должны получать HTML с OG-тегами.

## Как это устроено

- **Edge Function `share-og-plan`** (Supabase): по `GET ?ref=:ref` проверяет наличие плана в `shared_plans`, отдаёт HTML с og:title, og:description, og:image, og:url. Редиректа нет — страница для пользователя это SPA по тому же URL.
- **Прокси**: для запросов на `/p/*` от ботов (User-Agent краулера) отдавать ответ Edge Function; для обычных браузеров отдавать статику (GitHub Pages), чтобы открывалась SPA.

## Прокси для /p/*

Аналогично `/r/*`: правило перед фронтом.

**Cloudflare Worker (пример):**

```js
// Для пути /p/REF — вызывать share-og-plan (желательно только для ботов)
const pathname = new URL(request.url).pathname;
if (pathname.startsWith('/p/')) {
  const ref = pathname.replace(/^\/p\//, '');
  const ogUrl = `${SUPABASE_URL}/functions/v1/share-og-plan?ref=${encodeURIComponent(ref)}`;
  const res = await fetch(ogUrl);
  return new Response(res.body, { status: res.status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
```

Рекомендуется вызывать Edge Function только для User-Agent краулеров (Telegram, WhatsApp, Twitter и т.д.), чтобы обычные пользователи получали SPA с GitHub Pages.

## Деплой

```bash
npm run supabase:deploy:share-og-plan
```

OG-картинка: статический файл `https://momrecipes.online/og/og-plan.jpg` (деплоится с фронтом в public/og/).

## Ограничения (GitHub Pages)

- Без прокси все запросы на `/p/:ref` получают один и тот же `index.html` с общими meta — превью будет одинаковым для всех планов (og:title/og:description статические для сайта).
- С прокси и Edge Function превью для `/p/:ref` единое для всех планов (og:title = "Меню на день из MomRecipes", og:description = "План питания для семьи — составлено автоматически за 30 секунд"), но карточка выглядит корректно и по клику открывается нужная страница SPA.
