# Welcome / Prelogin и разделение ролей root

## 1. Список новых и изменённых файлов

### Новые файлы
- `src/utils/navigation.ts` — `WELCOME_PRELOGIN_FROM_ROOT_ENABLED` (вкл/выкл `/welcome` с root); `shouldShowWelcomePage()`: нет `hasSeenWelcome` → первый визит; `buildRootFirstAuthSearch()` — `/auth?mode=signup&…` UTM; UTM с `/` в query к `/auth` сохраняется
- `src/utils/standalone.ts` — определение standalone PWA (display-mode, navigator.standalone)
- `src/utils/onboardingAttribution.ts` — сохранение атрибуции (utm_*, entry_point, ref, shareRef) в `onboarding_attribution`
- `src/utils/landingAnalytics.ts` — безопасная обёртка событий аналитики (landing_view, landing_demo_open, share_*_cta_click и др.)
- `src/data/welcomeLandingDemoRecipe.ts` — статический демо-рецепт для блока на `/welcome` (без БД для анона)
- `src/components/RootRedirect.tsx` — умная маршрутизация с root `/`
- `src/components/landing/DemoRecipeSheet.tsx` — bottom sheet с демо-рецептом и CTA «Сохранить рецепт»
- `src/pages/LandingOnboardingScreen.tsx` — pre-auth экран `/welcome` (короткий onboarding, не маркетинговый лендинг)
- `src/pages/AppPreloginScreen.tsx` — приложенческий pre-login экран `/prelogin`

### Изменённые файлы
- `src/components/RootRedirect.tsx` — для гостя: при первом визите и `WELCOME_PRELOGIN_FROM_ROOT_ENABLED === true` → `/welcome`; иначе, если `false` и первый визит → `/auth?mode=signup` + `state.fromRootFirstVisit` (клиент выставляет `hasSeenWelcome` на Auth); иначе → `/auth` (вход), query сохраняется
- `src/pages/LandingOnboardingScreen.tsx` — при монтировании `localStorage.hasSeenWelcome`
- `src/App.tsx` — добавлены маршруты `/welcome`, `/prelogin`, root `/` отдаёт `<RootRedirect />`
- `src/pages/SharedPlanPage.tsx` — CTA «Собрать свой план» ведёт на `/welcome` с сохранением query (entry_point, share_ref, share_type); сохранение атрибуции; трекинг share_day_plan_cta_click / share_week_plan_cta_click
- `src/pages/PublicRecipeSharePage.tsx` — публичная страница рецепта по `/r/:shareRef` (вместо редиректа на `/recipe/:id`). При not_found — сообщение и кнопка на `/welcome`.
- `src/pages/AuthPage.tsx` — `state.fromRootFirstVisit`: `localStorage.hasSeenWelcome` (первый заход с root без welcome); остальное: событие `auth_page_view` вместо `landing_view`; ссылка «Попробовать пример без регистрации» → `/welcome` с трекингом share_recipe_cta_click при наличии share-атрибуции; `location.state.tab === 'signup'`; согласия на `/terms` и `/privacy` (см. `docs/dev/legal-copy-and-auth-consent.md`); после успешной регистрации — `/auth/signup-success` (цель VK Ads)
- `src/pages/AuthSignupSuccessPage.tsx` — экран «Регистрация успешна» / редирект в приложение при наличии сессии
- `src/utils/usageEvents.ts` — экспорт `hasShareRecipeAttribution()` для проверки прихода по shared recipe

---

## 2. Логика маршрутизации

### Root `/`
- **Recovery vs письмо о регистрации:** признак «сессия сброса пароля» для UI (`isRecoveryUrlPresent` / `recoveryFromAuthEvent` в `useAuth`) — только `type=recovery` в hash/query или страница `/auth/reset-password` с токенами. Подтверждение email после регистрации (`/auth/callback` + `type=signup` и токены) **не** должно помечаться как recovery (см. `src/utils/authRecoverySession.ts`).
- **Авторизован**, после загрузки `members`: при **0** записей в `members` → редирект на `/profile?openCreateProfile=1&welcome=1` (создание первого ребёнка, как после письма подтверждения); при наличии членов семьи → `/meal-plan` (текущий app-home). Welcome для авторизованных не показывается.
- **Не авторизован**, в URL нет токенов из письма: **нет** `hasSeenWelcome` (первый визит): при `WELCOME_PRELOGIN_FROM_ROOT_ENABLED` → `/welcome` (см. `RootRedirect`). При `WELCOME_PRELOGIN_FROM_ROOT_ENABLED === false` (текущее) → `/auth?mode=signup&…` (query с `/` сохраняется), `location.state.fromRootFirstVisit` → на `Auth` выставляется `hasSeenWelcome` и снимается `state` (без `setItem` в render в `RootRedirect`). **Повторный** заход → редирект на `/auth` (вкладка вход, как раньше), `search` с `/` к `/auth` передаётся.
- Маршрут `/prelogin` — компактный pre-login экран; автоматический выбор `/prelogin` vs `/welcome` при открытии `/` в `RootRedirect` не зашит (см. актуальный `RootRedirect.tsx`).
- Standalone для других частей приложения: `src/utils/standalone.ts`.

### `/welcome`
- При монтировании выставляется `localStorage.hasSeenWelcome = "true"`, чтобы следующий заход на `/` не показывал welcome снова.
- Короткий pre-auth onboarding: hero (название **MomRecipes 🌿** + одна строка подзаголовка), три компактные карточки преимуществ (заголовок + одна короткая строка, без иконок и галочек), основной CTA «Получить свой план» / «Войти», блок «Как выглядит рецепт в приложении» (`WelcomeRecipeBlock`), затем финальный блок с текстом, списком с ✔ и повторным CTA «Получить свой план».
- CTA **«Получить свой план»** ведёт на `/auth` с `mode=signup` (и сохранением `entry_point` / `share_*` из query welcome). CTA **«Войти»** ведёт на `/auth` **без** `mode=signup` — открывается вкладка входа (email/пароль); атрибуция из URL welcome по-прежнему передаётся в query.
- Блок рецепта на welcome для **неавторизованных** использует **статический** демо-рецепт (`src/data/welcomeLandingDemoRecipe.ts`), без вызова `get_recipe_full`: RPC не отдаёт чужие рецепты анону; раньше параллельный запрос демо-UUID ломал блок и при переходе с `/p/:ref` (шаринг плана), и на странице `/r/:shareRef`, если в проп передавался рецепт, а ошибка хука всё равно скрывала UI.
- Кнопка «Попробовать пример» (если есть в UI) открывает bottom sheet с демо-рецептом; «Сохранить рецепт» — для неавторизованных ведёт в auth с сообщением, для авторизованных — toast «Сохранено».
- При открытии сохраняется атрибуция в `onboarding_attribution`, отправляется событие `landing_view`.

### `/prelogin`
- Короткий приложенческий экран: заголовок «Добро пожаловать», подзаголовок, 2–3 benefit-строки, кнопки «Войти» и «Создать аккаунт».
- Без длинного маркетингового контента и demo menu.

### Share pages и CTA
- **Shared recipe** `/r/:shareRef`: публичная страница конкретного рецепта (без welcome). Пользователь видит рецепт (блок `WelcomeRecipeBlock` с пропом из `getRecipeByShareRef`), затем CTA «Собрать меню для своей семьи» → переход на `/auth?mode=signup&entry_point=shared_recipe&share_ref=...&share_type=recipe` (вкладка регистрации). Трекинг: `share_landing_view`, `share_recipe_cta_click`. Рецепт загружается через RPC `get_recipe_by_share_ref`. Текст в блоке «пользы» и чипсы **nutrition_goals** совпадают по логике с экраном `RecipePage` (каноническое `description` из ответа RPC, затем при пустоте — `buildRecipeBenefitDescription`; чипсы из `nutrition_goals` в объекте рецепта).
- **Shared plan (день)** `/p/:ref`: публичная страница меню дня; CTA «Собрать свой план» → переход на `/welcome?entry_point=shared_day_plan&share_ref=...&share_type=day_plan`, затем с Welcome → `/auth?mode=signup&...` (вкладка регистрации). Трекинг: `share_day_plan_cta_click`.
- **Shared plan (неделя)** `/p/:ref`: публичная страница меню недели; CTA «Собрать свой план» → `/welcome?entry_point=shared_week_plan&share_ref=...&share_type=week_plan`, затем Welcome → auth (signup). Трекинг: `share_week_plan_cta_click`.
- **Welcome** при переходе с day/week plan сохраняет `entry_point`, `share_ref`, `share_type` из URL и передаёт их в `/auth` при клике по CTA.
- **Recipe share not_found** (невалидный shareRef) → сообщение «Рецепт не найден или ссылка устарела», кнопка «На главную» → `/welcome`.

---

## 3. Как вручную протестировать

1. **Неавторизованный пользователь в браузере**
   - Очистить `localStorage` ключ `hasSeenWelcome` (или первый визит с устройства).
   - Открыть `https://momrecipes.online/` (или localhost) в обычном браузере, выйти из аккаунта.
   - Ожидание: редирект на `/welcome`, отображается короткий welcome-экран; после этого `hasSeenWelcome` установлен.
   - Повторно открыть `/` — ожидание: редирект на `/auth` (без welcome).
   - Открыть `/?utm_source=test` при отсутствии `hasSeenWelcome` — ожидание: редирект на `/welcome` (рекламные метки не пропускают welcome на первом визите).
   - Проверить: «Попробовать пример» → открывается sheet с рецептом; «Сохранить рецепт» → переход на `/auth` и toast; «Попробовать бесплатно» → переход на `/auth`. С экрана входа ссылка «Посмотреть пример рецепта» → `/welcome`.

2. **Неавторизованный пользователь в standalone PWA**
   - Установить PWA, открыть с главного экрана (standalone), выйти из аккаунта.
   - Открыть корень `/`.
   - Ожидание: редирект на `/prelogin`, короткий экран «Добро пожаловать» с кнопками Войти / Создать аккаунт.

3. **Авторизованный пользователь**
   - Войти в аккаунт, открыть `/` или `/welcome`.
   - Ожидание: при открытии `/` — если есть профили детей в `members`, редирект на `/meal-plan`; если профилей нет — на `/profile?openCreateProfile=1&welcome=1`. При прямом заходе на `/welcome` с уже выполненным входом — та же логика (без welcome-экрана для анонима, сразу app).

4. **Shared recipe**
   - Открыть ссылку вида `/r/:shareRef` в браузере без авторизации.
   - Ожидание: отображается публичная страница рецепта; CTA «Собрать меню для своей семьи» → переход на `/auth` с вкладкой «Регистрация», в URL сохраняются `entry_point=shared_recipe`, `share_ref`, `share_type=recipe`.

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

- **`/welcome`**: страница со скроллом: hero — **MomRecipes 🌿** и одна строка «Меню для ребёнка за пару минут»; три короткие карточки преимуществ; CTA **«Получить свой план»** и **«Войти»**; блок «Как выглядит рецепт в приложении» (`WelcomeRecipeBlock`); внизу финальный блок с абзацами, списком с ✔ и второй CTA **«Получить свой план»**.
- **`/prelogin`**: компактный экран: «Добро пожаловать», подзаголовок про меню и помощь, 2–3 короткие benefit-строки с галочками, кнопки «Войти» и «Создать аккаунт»; без больших маркетинговых блоков.
- **Demo recipe sheet**: снизу выезжающая панель с рецептом «Омлет с кабачком» (ингредиенты, шаги, совет шефа), внизу CTA «Сохранить рецепт».

Стиль: текущая оливковая палитра и типографика приложения, без тревожных формулировок и SOS-иконок на welcome.
