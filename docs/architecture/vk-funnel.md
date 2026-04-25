# VK-воронка (`/vk`)

Изолированный pre-auth поток для холодного трафика (например VK Ads): превью меню на день без регистрации, затем CTA → `/auth?mode=signup&entry_point=vk` и существующий онбординг / план / paywall.

## Маршруты и файлы

**Splash:** для пути `/vk` в `index.html` не прелоадится `splash-screen.png`, узел `#splash-screen` удаляется сразу после парса DOM; в `src/main.tsx` минимальное время показа splash = 0 и скрытие без ожидания `window.load` — быстрее первый paint для рекламного трафика.

| Область | Путь |
|--------|------|
| Страница воронки | `src/pages/VkFunnelPage.tsx`, маршрут `/vk` в `src/App.tsx` |
| Черновик + TTL 24h | `src/utils/vkDraft.ts`, ключ `lb.vkDraft.v1` |
| Вызов превью | `src/api/vkPreviewPlan.ts` → Edge `vk-preview-plan` |
| Типы | `src/types/vkFunnel.ts` |
| Аналитика post-auth | `src/utils/vkAuthAnalytics.ts` |
| Префилл первого профиля | `src/components/chat/ProfileEditSheet.tsx` (читает `getVkDraftForProfilePrefill`, после создания — `markVkHandoffConsumed`) |

## Edge `vk-preview-plan`

- Каталог: `supabase/functions/vk-preview-plan/` (`index.ts` — тонкий entrypoint, логика в модулях).
- Пул: `recipes` с `source in (seed, starter)`, фильтры как в плане (возраст, аллергии, dislikes, soft likes), обед = суп.
- В ответе каждого приёма пищи: `cooking_time_minutes` (из `recipes.cooking_time_minutes` / `cooking_time`), `nutrition_goals`, КБЖУ, `description`. На `/vk` карточки — **`RecipeCard`** (`variant="preview"`, `previewPresentation="collection"`) с настройками как у **hero-блока страницы рецепта**: `RecipeNutritionHeader` в режиме **`details`** и тон **`default`** («В одной порции:», белки/жиры/углеводы полными словами); строка **«Польза для…»** с иконкой 🌿 по возрасту из формы (`getBenefitLabel`); текст описания — из API, иначе детерминированный `buildRecipeBenefitDescription` (стабильный ключ `vk_session_id` + слот + заголовок); чипсы целей — **не** `quiet` (`previewNutritionGoalsLoud`). Без ингредиентов и без нижних блоков рецепта.
- Если в БД &lt; 3 слотов — опциональный вызов DeepSeek (см. `docs/architecture/system-prompts-map.md` §VK preview), иначе mock для пустых слотов.
- **Не** пишет в user-bound таблицы.

## Handoff после auth

1. Черновик в `localStorage` сохраняет `age_months`, аллергии, лайки/дизлайки, опционально `dayPlanPreview`, `vk_session_id`.
2. На Free тарифе **likes/dislikes не сохраняются** в `members` (см. `clampMemberPayloadForTier`); в форме создания профиля они префиллятся только для **paid** лимитов; для Free пользователь всё равно видит возраст и аллергии из VK.
3. После успешного `createMember` вызывается `markVkHandoffConsumed()` — повторный автопрефилл отключён.
4. Заполнение недели: существующий `startFillDay` / `MealPlanPage` без дублирования бизнес-логики.

## Деплой

- Edge: `npm run supabase:deploy:vk-preview-plan` (нужен `DEEPSEEK_API_KEY` в проекте Supabase, как для `deepseek-chat`).
- Фронт: коммит + push на GitHub Pages.

## Ручная проверка

1. Открыть `/vk` в инкогнито → hero → 3 шага → превью (4 карточки или частично + retry).
2. «Получить полный план» → URL содержит `mode=signup&entry_point=vk`.
3. Регистрация → создание ребёнка: поля возраста/аллергий презаполнены из черновика (если TTL не истёк).
4. Убедиться, что `/welcome`, `/prelogin`, `/auth`, `/meal-plan` без регрессий.
