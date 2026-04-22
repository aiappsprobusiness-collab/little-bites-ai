# Developer notes (Mom Recipes / Little Bites AI)

## Сверка `DATABASE_SCHEMA.md` с реальной БД

Локальная проверка: таблицы `public.*` из `information_schema` сравниваются с заголовками `### \`public.*\`` в `docs/database/DATABASE_SCHEMA.md` (активные разделы; блок **Legacy / Removed** в заголовках не участвует).

**Запуск:**

```bash
npm run check:db-docs
```

**Переменные окружения** (в `.env` или `.env.local`, не коммитить):

- `DATABASE_URL` **или** `SUPABASE_DB_URL` — **URI прямого подключения к Postgres** (Supabase Dashboard → *Project Settings* → *Database* → *Connection string* → URI). Это не `SUPABASE_ANON_KEY` / service role: нужен именно connection string к БД.

**Когда имеет смысл запускать:**

- после миграций, которые добавляют/переименовывают таблицы в `public`;
- перед релизом / деплоем, если менялась схема — чтобы документация не отставала от production.

При рассинхроне скрипт завершается с кодом **1** и печатает списки «есть в БД, нет в доке» и «есть в доке, нет в БД». Без URI к БД — код **2** и подсказка в консоли.

---

## Таблицы, ссылающиеся на recipes (по миграциям)

| Таблица | Связь с recipes |
|--------|------------------|
| **public.favorites_v2** | колонка `recipe_id` (FK) |
| **public.meal_plans_v2** | JSONB `meals`: в слотах хранятся `recipe_id` |
| **public.chat_history** | колонка `recipe_id` (может быть NULL) |
| **public.share_refs** | колонка `recipe_id` (FK, ON DELETE CASCADE) |
| **public.shopping_list_items** | колонка `recipe_id`; таблица может отсутствовать |
| **public.recipe_ingredients** | колонка `recipe_id` (FK) |
| **public.recipe_steps** | колонка `recipe_id` (FK) |

---

## Recipe age ranges (plan/pool)

After migrations `20260301130000_fix_recipe_age_ranges` and `20260301130100_backfill_recipe_age_ranges`:

- `recipes.min_age_months` / `max_age_months` no longer have defaults; plan generation filters by member age.
- Use these queries for diagnostics.

### How many recipes have NULL age range

```sql
SELECT COUNT(*) AS null_range_count
FROM public.recipes
WHERE min_age_months IS NULL AND max_age_months IS NULL;
```

### How many still have the old default 6–36

```sql
SELECT COUNT(*) AS legacy_default_count
FROM public.recipes
WHERE min_age_months = 6 AND max_age_months = 36;
```

### Top 20 recipes that would target infants and contain adult keywords

(Recipes with min ≤ 12 or NULL that contain "свинина/говядина/жарен/бекон" in title or ingredients.)

```sql
SELECT r.id, r.title, r.min_age_months, r.max_age_months
FROM public.recipes r
LEFT JOIN LATERAL (
  SELECT string_agg(ri.name || ' ' || COALESCE(ri.display_text, ''), ' ') AS ing_text
  FROM public.recipe_ingredients ri
  WHERE ri.recipe_id = r.id
) ing ON true
WHERE (r.min_age_months IS NULL OR r.max_age_months IS NULL OR r.min_age_months <= 12)
  AND (
    LOWER(COALESCE(r.title, '') || ' ' || COALESCE(r.description, '') || ' ' || COALESCE(ing.ing_text, '')) LIKE '%свинин%'
    OR LOWER(COALESCE(r.title, '') || ' ' || COALESCE(r.description, '') || ' ' || COALESCE(ing.ing_text, '')) LIKE '%говядин%'
    OR LOWER(COALESCE(r.title, '') || ' ' || COALESCE(r.description, '') || ' ' || COALESCE(ing.ing_text, '')) LIKE '%жарен%'
    OR LOWER(COALESCE(r.title, '') || ' ' || COALESCE(r.description, '') || ' ' || COALESCE(ing.ing_text, '')) LIKE '%бекон%'
  )
ORDER BY r.created_at DESC
LIMIT 20;
```

### Age filter behaviour (Edge)

- **getMemberAgeContext(member)** in `_shared/memberAgeContext.ts`: returns `{ ageMonths?, applyFilter }`. For child with `age_months` < 216 → `applyFilter: true`.
- **Plan pool**: `recipeFitsAgeRange(recipe, ageMonths)` and `recipeBlockedByInfantKeywords(recipe, ageMonths)` in `generate-plan/index.ts` filter candidates for 6–12 мес (and ≤9 мес extra keywords).

---

## Purge legacy recipes (20260303140000_purge_legacy_recipes)

Жёсткая чистка рецептов: оставляются только рецепты, соответствующие новой схеме (возрастные диапазоны, description/steps/chef_advice). Тестовая база; живых клиентов нет.

### Как применить миграцию

```bash
npx supabase db push
# или с флагом, если миграция «вставляется» до последней на remote:
npx supabase db push --include-all
```

### Таблицы, которые чистились

| Таблица | Связь с recipes | Действие |
|--------|------------------|----------|
| **meal_plans_v2** | JSONB `meals` (в слотах хранится recipe_id) | `DELETE` всех строк (планы целиком) |
| **favorites_v2** | колонка `recipe_id` | `DELETE` строк, где recipe_id в списке purge |
| **chat_history** | колонка `recipe_id` | `UPDATE recipe_id = NULL` для purge |
| **share_refs** | колонка `recipe_id` | `DELETE` строк по purge |
| **shopping_list_items** | колонка `recipe_id` | `DELETE` по purge (только если таблица есть) |
| **recipe_steps** | колонка `recipe_id` | `DELETE` по purge |
| **recipe_ingredients** | колонка `recipe_id` | `DELETE` по purge |
| **recipes** | — | `DELETE` по purge |

Существование `shopping_list_items` проверяется через `information_schema`; при отсутствии таблицы шаг пропускается.

### Проверка после миграции (SQL)

```sql
-- Сколько всего рецептов осталось
SELECT count(*) AS total_recipes FROM public.recipes;

-- Распределение по возрастным диапазонам
SELECT min_age_months, max_age_months, count(*) 
FROM public.recipes 
GROUP BY min_age_months, max_age_months 
ORDER BY 1, 2;

-- Не должно быть legacy 6–36
SELECT count(*) AS legacy_6_36 
FROM public.recipes 
WHERE min_age_months = 6 AND max_age_months = 36;

-- Не должно быть NULL по возрасту
SELECT count(*) AS null_age 
FROM public.recipes 
WHERE min_age_months IS NULL OR max_age_months IS NULL;
```

### Проверка в UI

1. Выбрать профиль ребёнка 6 мес., сгенерировать план на день/неделю — в плане не должно быть блюд со свининой/стейком/жареным и т.п.
2. После чистки план может быть пустым или заполняться не полностью — это допустимо до наполнения пула новыми рецептами.

---

## Android Chrome / браузер: навигация и задержки

- **Нижнее меню (вкладки) не переключается**: на Android Chrome тап по кнопке мог не срабатывать из‑за 300 ms задержки или блокировки main thread. В `BottomNavigation` используются `Link` вместо `button` + `navigate()` и `touch-action: manipulation`, чтобы браузер обрабатывал переходы надёжнее.
- **Долгая «пустая» загрузка при открытии**: корень `/` ждёт `getSession()` (Supabase). На медленной сети или при холодном старте это может занимать до 10+ секунд. После 10 сек показывается подсказка «Проверьте интернет и обновите страницу» (`RootRedirect`).
- **Аккаунт без детских профилей (`members` пусто)**: после входа и при открытии `/` или прямом заходе на `/meal-plan` выполняется редирект на `/profile?openCreateProfile=1&welcome=1` (вкладка Профиль + модалка создания ребёнка), как после подтверждения email — чтобы не оставлять пользователя на пустом «Плане». В чате по-прежнему показывается `FamilyOnboarding` при отсутствии профилей. Данные членов семьи хранятся в `members` по `user_id`.

---

## Auth: сброс пароля (Supabase)

- **Клиент:** `requestPasswordReset` → `resetPasswordForEmail` с `redirectTo: <origin>/auth/reset-password`. **`isRecoverySession`** = `recoveryFromAuthEvent` **или** `sessionStorage` `lb-auth-recovery-pending` (`readRecoveryPendingFlag`, выставляется при `PASSWORD_RECOVERY`, recovery JWT, и в **`AuthCallbackPage`** перед переходом на `/auth/reset-password`) **или** JWT с `amr.recovery`. В первом `getSession` не сбрасывать recovery-флаги, если **`isRecoveryUrlPresent()`** (в URL ещё токены сброса) — иначе старая «обычная» сессия вкладки затирает сценарий из письма. На **`AuthUpdatePasswordPage`**: не делать `navigate("/")`, если при открытии страницы в URL были токены/code сброса (`urlHadTokens`), даже если JWT временно без признака recovery — иначе пользователь попадал в приложение без формы смены пароля. Форма — `updateUser({ password })`. Старые письма с `/auth/callback`: `AuthCallbackPage` ведёт на `/auth/reset-password`.
- **Dashboard:** *Authentication → URL Configuration* — в **Redirect URLs** должны быть полные URL **без лишнего слэша в конце пути** (как в коде): `https://…/auth/callback`, `https://…/auth/reset-password`. Вариант `…/auth/callback/` (со слэшем) — отдельная строка; если хост редиректит на URL со слэшем, в списке должен быть именно тот вариант, куда реально приходит браузер. Иначе редирект после письма заблокируется и возможны ошибки `/auth` в Network.
- **Шаблон письма «Reset password»** (Supabase Hosted): в теле письма ссылку нужно вести через **`{{ .ConfirmationURL }}`** (или эквивалент для вашей версии шаблона) — это полный URL с токеном и корректным `redirectTo`. Не подставлять вручную только `SiteURL` без токена.
- **GitHub Pages:** прямой заход на вложенный маршрут SPA (`/auth/reset-password`, `/recipe/…`) требует **`404.html`** в корне деплоя — копия собранного `index.html`, иначе сервер отдаёт настоящий **404** без приложения. Генерация: плагин `github-pages-spa-fallback` в `vite.config.ts` (при `npm run build`); workflow `.github/workflows/pages.yml` дублирует шаг на всякий случай.
- **`AuthCallbackPage`:** нельзя определять recovery только по `type=recovery` в URL **после** `await getSession()` — к этому моменту клиент Supabase уже мог очистить hash. Решение: **`isRecoveryJwtSession(session)`** и ранний снимок URL в начале `useEffect`. PKCE **`?code=`** в `shouldHandOffEmailAuthToCallback` учитывать **только** на `/`, `/auth/callback`, `/auth/reset-password` — иначе чужой `?code=` на `/meal-plan` вызывает бесконечный редирект в guard.

---

## Профиль после подтверждения email и paywall

- **`AuthCallbackPage`**, **`RootRedirect` (`/`)**, **`AppPreloginScreen`**, **`LandingOnboardingScreen`**, редирект с **`/meal-plan`** при 0 профилях: если у пользователя нет записей в `members`, целевой путь — `/profile?openCreateProfile=1&welcome=1` (константа `PROFILE_FIRST_CHILD_ONBOARDING` в `src/utils/firstChildOnboarding.ts`). Параметр `welcome=1` одноразово включает приветственный блок в модалке «Новый профиль» (`ProfileEditSheet`); из URL он удаляется при открытии.
- **Глобальный paywall** (`UnifiedPaywall` / `LegacyPaywall` в `App.tsx`): слой `z-[100]`, чтобы окно подписки было **поверх** нижних sheet/диалогов (`z-50`), например при попытке добавить вторую аллергию на Free из формы создания профиля.
- **Free, одна аллергия:** подсказка под полем — `FREE_ALLERGY_SINGLE_HINT_CREATE`. При попытке второй аллергии **в онбординге первого профиля** (`ProfileEditSheet` / `AddChildForm`) открывается единый paywall с причиной `onboarding_second_allergy_free` и текстами из `onboardingSecondAllergyPaywallCopy.ts` (не сбрасывать форму: см. `sameKey` в `ProfileEditSheet` и блокировку закрытия sheet, пока открыт paywall). Редактирование существующего ребёнка (`ChildProfileEditPage`) по-прежнему использует `allergies_locked` и `FREE_ALLERGY_PAYWALL_MESSAGE`.

---

## Toast (Radix UI)

- **Код:** `src/components/ui/toast.tsx`, `toaster.tsx`, `src/hooks/use-toast.ts`.
- **Успех (default):** оливковый фон (`bg-primary`), белый текст, скругление `rounded-2xl`, иконка `CheckCircle2`; крестик скрыт. Автоскрытие по умолчанию **2.3 с** (`DEFAULT_TOAST_DURATION_MS`), если `duration` в вызове не задан.
- **Ошибка (`destructive`):** красный фон, иконка `AlertCircle`, крестик виден.
- **С действием / бесконечное ожидание** (например PWA «Обновить», `duration: Infinity`): кнопка `ToastAction` и крестик остаются.
- **Позиция:** мобильный viewport — под заголовком (`--layout-header-offset` + `0.5rem`), не перекрывает sticky TopBar; `z-30` (контент ниже шапки `z-40`).

---

## Маркетинговые короткие ссылки `/go/:slug`

- **БД:** `public.marketing_links` (см. `docs/database/DATABASE_SCHEMA.md`). **Миграции:** `20260412120000_marketing_links.sql`, `20260412130000_marketing_links_click_count.sql` — `db push` или SQL Editor. **Зафиксировано:** первая миграция применена **вручную** в SQL Editor; вторая — применить тем же способом после деплоя кода.
- **Код:** `src/utils/marketingLinks.ts` (`createMarketingLink`, `getMarketingLinks`, `getMarketingLinkBySlug`), статический fallback — `src/config/marketingLinks.ts` (`STATIC_MARKETING_LINKS`), редирект — `src/pages/MarketingLinkRedirectPage.tsx`.
- **Админка:** `/admin/marketing-links` доступна только если в `.env` задано **`VITE_ADMIN_MODE=true`** (Vite не подставляет переменные без префикса `VITE_`). Копирование полного URL: `https://momrecipes.online/go/{slug}` (константа `getPublicGoUrl` / `MARKETING_GO_PUBLIC_ORIGIN` в `src/utils/marketingLinks.ts`).
