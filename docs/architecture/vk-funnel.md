# VK-воронка (`/vk`) и Telegram pre-auth источник

Изолированный pre-auth поток для холодного трафика (например VK Ads): превью меню на день без регистрации, затем CTA → `/auth?mode=signup&entry_point=vk` и существующий онбординг / план / paywall.

Для Telegram-бота используется тот же post-auth маршрут (`/auth?mode=signup`) и та же атрибуция `entry_point`, но с источником `telegram`.

## Редирект с корня `/` (флаги)

- **По умолчанию:** гость, **первый визит** (нет `hasSeenWelcome`), открывает корень сайта → `/welcome` с **сохранением** query (как для `/vk`), при `WELCOME_PRELOGIN_FROM_ROOT_ENABLED === true` и `VK_ROOT_REDIRECT_ENABLED === false` (см. `RootRedirect.tsx`). Для кампаний всё равно надёжнее давать **прямую ссылку** на целевой путь (`/welcome?…`, `/auth?…`, `/vk?…`), а не только голый домен.
- **Опция «корень = VK»:** при `VK_ROOT_REDIRECT_ENABLED === true` первый визит с `/` → `/vk` с сохранением query. Имеет **приоритет** над `WELCOME_PRELOGIN_FROM_ROOT_ENABLED`.
- **Не затрагивает:** токены из письма → `/auth/callback`, recovery, авторизованные, повторные визиты гостя (`hasSeenWelcome`).
- **Локальные пометки:** `docs/dev/vk-funnel-local-changelog.md`.

## Маршруты и файлы

**Splash:** для пути `/vk` в `index.html` не прелоадится `splash-screen.png`, узел `#splash-screen` удаляется сразу после парса DOM; в `src/main.tsx` минимальное время показа splash = 0 и скрытие без ожидания `window.load` — быстрее первый paint для рекламного трафика.

| Область | Путь |
|--------|------|
| Страница воронки | `src/pages/VkFunnelPage.tsx`, маршруты `/vk` и `/vk/` в `src/App.tsx` |
| Редирект с `/` | `src/components/RootRedirect.tsx`, флаги `VK_ROOT_REDIRECT_ENABLED` и `shouldShowWelcomePage()` в `src/utils/navigation.ts` |

**Hero (первый кадр /vk, до шагов 1–3):** визуал согласован с `/auth` — фон `auth-page-bg` (тот же кремовый/радиальный градиент, что у экрана входа), над карточкой бренд **MomRecipes** и подзаголовок «Меню для ребёнка — за 1 минуту»; в белой «стеклянной» карточке с тенью — оффер («…за 10 секунд»), пояснение, три коротких пункта пользы с отметками, CTA «Составить меню»; лёгкий декоративный акцент (лист) внизу блока.
| Черновик + TTL 24h | `src/utils/vkDraft.ts`, ключ `lb.vkDraft.v1` |
| Вызов превью | `src/api/vkPreviewPlan.ts` → Edge `vk-preview-plan` |
| Типы | `src/types/vkFunnel.ts` |
| Аналитика post-auth | `src/utils/vkAuthAnalytics.ts` |
| Префилл первого профиля | `src/components/chat/ProfileEditSheet.tsx` (читает `getVkDraftForProfilePrefill`, после создания — `markVkHandoffConsumed`) |

## Edge `vk-preview-plan`

- Каталог: `supabase/functions/vk-preview-plan/` (`index.ts` — тонкий entrypoint, логика в модулях).
- Пул: `recipes` с `source in (seed, starter)`, фильтры как в плане (возраст, аллергии, dislikes, soft likes). Позиция **обед:** сначала только **супы**; если ни один не прошёл фильтры — для превью подставляется любой рецепт с типом обед из каталога (см. `docs/decisions/MEAL_TYPE_AND_LUNCH_SOUP.md`). Dislikes из чипов («овощи», «мясо», …) расширяются токенами и при наличии — по `recipe_ingredients.category` (см. `supabase/functions/_shared/dislikeExpansion.ts`, `docs/decisions/PREFERENCES_LIKES_DISLIKES.md`).
- Входные `entry_point`: `vk` и `telegram` (для Telegram webhook-бота).
- В ответе каждого приёма пищи: `cooking_time_minutes` (из `recipes.cooking_time_minutes` / `cooking_time`), `nutrition_goals`, КБЖУ, `description`. На `/vk` карточки — **`RecipeCard`** (`variant="preview"`, `previewPresentation="collection"`) с настройками как у **hero-блока страницы рецепта**: `RecipeNutritionHeader` в режиме **`details`** и тон **`default`** («В одной порции:», белки/жиры/углеводы полными словами); строка **«Польза для…»** с иконкой 🌿 по возрасту из формы (`getBenefitLabel`); текст описания — из API, иначе детерминированный `buildRecipeBenefitDescription` (стабильный ключ `vk_session_id` + слот + заголовок); чипсы целей — **не** `quiet` (`previewNutritionGoalsLoud`). Без ингредиентов и без нижних блоков рецепта.
- Если в БД &lt; 3 слотов — опциональный вызов DeepSeek (см. `docs/architecture/system-prompts-map.md` §VK preview), иначе mock для пустых слотов.
- **Не** пишет в user-bound таблицы.

## Telegram onboarding bot (edge webhook)

- Каталог: `supabase/functions/telegram-onboarding/` (`index.ts` — thin entrypoint, бизнес-логика в модулях).
- Бот ведёт диалог до регистрации: возраст → аллергии → likes → dislikes.
- Состояние шагов хранится в `public.telegram_onboarding_sessions`.
- После завершения опроса бот вызывает `buildVkPreviewDayPlan` (reuse текущей логики превью) с `entry_point=telegram`.
- CTA ведёт на `/auth?mode=signup&entry_point=telegram` (+ UTM / `blogger_id` при наличии), дальше работает текущий auth/onboarding.
- В ответе превью для слотов из БД у блюд есть `recipe_id` — в боте строятся кнопки-ссылки на `/recipe/:id`; для «карточек как на сайте» добавлена кнопка на `/vk` с той же атрибуцией.

## Handoff после auth

1. Черновик в `localStorage` сохраняет `age_months`, аллергии, лайки/дизлайки, опционально `dayPlanPreview`, `vk_session_id`.
2. На Free тарифе **likes/dislikes не сохраняются** в `members` (см. `clampMemberPayloadForTier`); в форме создания профиля они префиллятся только для **paid** лимитов; для Free пользователь всё равно видит возраст и аллергии из VK.
3. После успешного `createMember` вызывается `markVkHandoffConsumed()` — повторный автопрефилл отключён.
4. Заполнение недели: существующий `startFillDay` / `MealPlanPage` без дублирования бизнес-логики.

## Деплой

- Edge: `npm run supabase:deploy:vk-preview-plan` (нужен `DEEPSEEK_API_KEY` в проекте Supabase, как для `deepseek-chat`).
- Фронт: коммит + push на GitHub Pages.

## Ручная проверка

1. **Инкогнито, корень:** при `VK_ROOT_REDIRECT_ENABLED === true` и пустом `hasSeenWelcome` — ожидается `/vk`; при `false` и включённом welcome — `/welcome`. Повторно открыть `/` — гость на `/auth` (без повторного welcome/vk с корня).
2. Открыть `/vk` в инкогнито → hero → 3 шага → превью (4 карточки или частично + retry).
3. «Получить полный план» → URL содержит `mode=signup&entry_point=vk`.
4. Регистрация → создание ребёнка: поля возраста/аллергий презаполнены из черновика (если TTL не истёк).
5. Убедиться, что `/welcome`, `/prelogin`, `/auth`, `/meal-plan` без регрессий.
