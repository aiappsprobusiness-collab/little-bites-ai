# Welcome / Prelogin и разделение ролей root

## 1. Список новых и изменённых файлов

### Новые файлы
- `src/utils/standalone.ts` — определение standalone PWA (display-mode, navigator.standalone)
- `src/utils/onboardingAttribution.ts` — сохранение атрибуции (utm_*, entry_point, ref, shareRef) в `onboarding_attribution`
- `src/utils/landingAnalytics.ts` — безопасная обёртка событий аналитики (landing_view, landing_demo_open, share_*_cta_click и др.)
- `src/data/demoRecipe.ts` — хардкодный демо-рецепт «Омлет с кабачком»
- `src/components/RootRedirect.tsx` — умная маршрутизация с root `/`
- `src/components/landing/DemoRecipeSheet.tsx` — bottom sheet с демо-рецептом и CTA «Сохранить рецепт»
- `src/pages/LandingOnboardingScreen.tsx` — маркетинговый экран `/welcome`
- `src/pages/AppPreloginScreen.tsx` — приложенческий pre-login экран `/prelogin`

### Изменённые файлы
- `src/App.tsx` — добавлены маршруты `/welcome`, `/prelogin`, root `/` отдаёт `<RootRedirect />`
- `src/pages/SharedPlanPage.tsx` — CTA «Получить свой план питания» ведёт на `/auth` с сохранением query; сохранение атрибуции; трекинг share_day_plan_cta_click / share_week_plan_cta_click
- `src/pages/PublicRecipeSharePage.tsx` — публичная страница рецепта по `/r/:shareRef` (вместо редиректа на `/recipe/:id`). При not_found — сообщение и кнопка на `/welcome`.
- `src/pages/AuthPage.tsx` — событие `auth_page_view` вместо `landing_view`; ссылка «Попробовать пример без регистрации» → `/welcome` с трекингом share_recipe_cta_click при наличии share-атрибуции; поддержка `location.state.tab === 'signup'` для дефолтной вкладки
- `src/utils/usageEvents.ts` — экспорт `hasShareRecipeAttribution()` для проверки прихода по shared recipe

---

## 2. Логика маршрутизации

### Root `/`
- **Авторизован** → редирект на `/meal-plan` (текущий app-home).
- **Не авторизован + standalone PWA** → редирект на `/prelogin`.
- **Не авторизован + обычный браузер** → редирект на `/welcome`.
- Standalone определяется только на клиенте после гидрации (избежание mismatch).

### `/welcome`
- Маркетинговый landing onboarding: hero, 3 карточки преимуществ, блок «Пример результата», CTA «Попробовать бесплатно».
- Кнопка «Попробовать пример» открывает bottom sheet с демо-рецептом; «Сохранить рецепт» — для неавторизованных ведёт в auth с сообщением, для авторизованных — toast «Сохранено».
- При открытии сохраняется атрибуция в `onboarding_attribution`, отправляется событие `landing_view`.

### `/prelogin`
- Короткий приложенческий экран: заголовок «Добро пожаловать», подзаголовок, 2–3 benefit-строки, кнопки «Войти» и «Создать аккаунт».
- Без длинного маркетингового контента и demo menu.

### Share pages и CTA
- **Shared recipe** `/r/:shareRef`: публичная страница конкретного рецепта (без welcome). Пользователь видит рецепт, затем CTA «Собрать меню для своей семьи» → переход на `/auth?mode=signup&entry_point=shared_recipe&share_ref=...&share_type=recipe` (вкладка регистрации). Трекинг: `share_landing_view`, `share_recipe_cta_click`. Рецепт загружается через RPC `get_recipe_by_share_ref`.
- **Shared plan (день)** `/p/:ref`: публичная страница меню дня; CTA «Собрать свой план» → переход на `/welcome?entry_point=shared_day_plan&share_ref=...&share_type=day_plan`, затем с Welcome → `/auth?mode=signup&...` (вкладка регистрации). Трекинг: `share_day_plan_cta_click`.
- **Shared plan (неделя)** `/p/:ref`: публичная страница меню недели; CTA «Собрать свой план» → `/welcome?entry_point=shared_week_plan&share_ref=...&share_type=week_plan`, затем Welcome → auth (signup). Трекинг: `share_week_plan_cta_click`.
- **Welcome** при переходе с day/week plan сохраняет `entry_point`, `share_ref`, `share_type` из URL и передаёт их в `/auth` при клике по CTA.
- **Recipe share not_found** (невалидный shareRef) → сообщение «Рецепт не найден или ссылка устарела», кнопка «На главную» → `/welcome`.

---

## 3. Как вручную протестировать

1. **Неавторизованный пользователь в браузере**
   - Открыть `https://momrecipes.online/` (или localhost) в обычном браузере, выйти из аккаунта.
   - Ожидание: редирект на `/welcome`, отображается маркетинговый экран.
   - Проверить: «Попробовать пример» → открывается sheet с рецептом; «Сохранить рецепт» → переход на `/auth` и toast; «Попробовать бесплатно» → переход на `/auth`.

2. **Неавторизованный пользователь в standalone PWA**
   - Установить PWA, открыть с главного экрана (standalone), выйти из аккаунта.
   - Открыть корень `/`.
   - Ожидание: редирект на `/prelogin`, короткий экран «Добро пожаловать» с кнопками Войти / Создать аккаунт.

3. **Авторизованный пользователь**
   - Войти в аккаунт, открыть `/` или `/welcome`.
   - Ожидание: при открытии `/` редирект на `/meal-plan`; при прямом заходе на `/welcome` — показ welcome (можно оставить или донастроить редирект на app по желанию).

4. **Shared recipe**
   - Открыть ссылку вида `/r/:shareRef` в браузере без авторизации.
   - Ожидание: отображается публичная страница рецепта; CTA «Собрать меню для своей семьи» → переход на `/auth` с вкладкой «Начать» (регистрация), в URL сохраняются `entry_point=shared_recipe`, `share_ref`, `share_type=recipe`.

5. **Shared day plan**
   - Открыть `/p/:ref` для плана на день (валидный ref).
   - Ожидание: отображается меню на день; кнопка «Собрать свой план» ведёт на `/welcome` с `entry_point=shared_day_plan`, `share_ref`, `share_type=day_plan`; с Welcome кнопка «Получить свой план» ведёт на `/auth` с вкладкой регистрации и теми же параметрами.

6. **Shared week plan**
   - Открыть `/p/:ref` для плана на неделю (валидный ref).
   - Ожидание: отображается меню на неделю; кнопка «Собрать свой план» ведёт на `/welcome`, затем на `/auth` (signup) с сохранением контекста.

7. **Атрибуция**
   - Открыть `/welcome?utm_source=telegram&ref=test`.
   - В localStorage ключ `onboarding_attribution` должен содержать source, ref, first_landing_path.

---

## 4. Итоговые экраны (кратко)

- **`/welcome`**: одна длинная страница со скроллом: логотип/название MomRecipes, заголовок «Не думайте каждый день, чем кормить ребёнка», подзаголовок «Меню, рецепты и советы — за 1 минуту», CTA «Попробовать пример» и «Войти»; три спокойные карточки (ребёнок не ест / меню на каждый день / можно спросить); блок «Пример результата» с демо «Сегодняшнее меню» (3–4 приёма пищи); внизу кнопка «Попробовать бесплатно».
- **`/prelogin`**: компактный экран: «Добро пожаловать», подзаголовок про меню и помощь, 2–3 короткие benefit-строки с галочками, кнопки «Войти» и «Создать аккаунт»; без больших маркетинговых блоков.
- **Demo recipe sheet**: снизу выезжающая панель с рецептом «Омлет с кабачком» (ингредиенты, шаги, совет шефа), внизу CTA «Сохранить рецепт».

Стиль: текущая оливковая палитра и типографика приложения, без тревожных формулировок и SOS-иконок на welcome.
