# VK-воронка (`/vk`)

Изолированный pre-auth поток для холодного трафика (например VK Ads): превью меню на день без регистрации, затем CTA → `/auth?mode=signup&entry_point=vk` и существующий онбординг / план / paywall.

## Маршруты и файлы

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
- В ответе каждого приёма пищи: при наличии в БД — `nutrition_goals` (whitelist как в `recipes.nutrition_goals`), макросы `protein` / `fat` / `carbs` (граммы), `calories`. На `/vk` карточки показывают цели (подписи как в приложении), строку Б/Ж/У и кнопку «Показать полностью» для длинного описания.
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
