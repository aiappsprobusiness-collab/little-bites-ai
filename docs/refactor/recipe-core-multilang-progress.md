# Recipe Core & Multilang Refactor Progress

## Current stage
- Stage 3 — recipe_translations + locale-aware reads (completed)
- Stage 4 — GOALS SYSTEM (minimal implementation, completed)
- Stage 4.1 — goals UX + plan integration (completed)
- Stage 4.2 — smart goal prioritization in generate-plan (completed)
- Stage 4.3 — family-aware scoring in generate-plan (completed)
- Stage 4.3.1 — plan hint copy + paywall feature line + text wrap (completed)
- Stage 4.3.2 — goal selector Free vs Premium/Trial (UI + client sanitize `selected_goal`) (completed)
- Stage 4.3.3 — plan goal impact visible (badges + copy) (completed)
- Stage 4.3.4 — goals UI cleanup (minimal chips + no extra copy on cards) (completed)
- Stage 4.3.5 — goal chips subtle transition + tap feedback (CSS only) (completed)
- Stage 4.3.6 — deterministic benefit description block (UI-only) (completed)
- **Current / next:** Stage 4.4 (4.4.1 done) → **Stage 4.4.2** — generate-plan cultural relevance scoring
- **Pending after 4.4:** Stage 5 — plan page refactor

**После Stage 3:** master progress продолжается как Stage 4 = nutrition_traits + goals, затем **Stage 4.4** (культурно-осознанное ранжирование общего пула в `generate-plan`), **Stage 5** = plan page refactor (см. Planned stages ниже). Отдельный **multilang rollout track** описан в [recipe-multilang-rollout-stages.md](./recipe-multilang-rollout-stages.md); его стадии обозначены **ML-4 … ML-9**, чтобы не путать с master stages.

> **Актуальность архивных подпунктов Stage 2.x:** ниже по тексту исторические чеклисты про `recipeDescriptionComposer` и `descriptionSource: "composer"` отражают прошлую реализацию. **Сейчас** финальный `recipes.description` и санитизированное поле в ответе чата задаются **`buildRecipeBenefitDescription`** (см. обновлённый § Stage 4.3.6).

## Planned stages
- [x] Stage 1 — locale + trust_level
- [x] Stage 2 — description composer
- [x] Stage 2.1 — composer polishing & token reduction
- [x] Stage 2.2 — chef advice restore + consistency guard
- [x] Stage 2.3 — description path cleanup + anti-context leakage + latency audit
- [x] Stage 2.4 — description rollback (LLM primary)
- [x] Stage 2.5 — Recipe Pool & Feedback System (see checklist below)
- [x] Stage 2.5.1 — Feedback Stabilization (see checklist below)
- [x] Stage 2.5.2 — Pool Stabilization (see checklist below)
- [x] Stage 2.5.3 — Cold Start Protection (see checklist below)
- [x] Stage 3 — recipe_translations + locale-aware reads
- [x] Stage 4 — goals system (nutrition_goals)
- [x] Stage 4.1 — goals visible in preview (plan + favorites), plan goal selector, generate-plan `selected_goal`, UI labels via `GOAL_LABELS`
- [x] Stage 4.2 — generate-plan scoring + diversity (no pool narrowing; lunch/soup unchanged)
- [x] Stage 4.3 — family-aware + age-aware + toddler soft-mode scoring (generate-plan only)
- [x] Stage 4.3.1 — UI copy + layout (PlanModeHint family text/subtext, Paywall first feature; wrap/min-w-0)
- [x] Stage 4.3.2 — PlanGoalChipsRow: Free только «Баланс»; остальные → paywall; `selectGoalForEdge` + хук `usePlanGenerationJob`
- [x] Stage 4.3.3 — MealCard: бейдж «Под вашу цель» + короткое пояснение; строка «Подобрано с акцентом…»; при отсутствии совпадений по цели — дисклеймер
- [x] Stage 4.3.4 — goals UI cleanup: `PlanGoalChipsRow` свёртка до 3 + «…»; убраны сводка «Подобрано с акцентом…» и бейджи/пояснения на карточках плана
- [x] Stage 4.3.5 — `PlanGoalChipsRow`: плавные переходы состояния + лёгкий `active:scale-[0.98]`; у locked чипов без press-scale
- [x] Stage 4.3.6 — deterministic benefit text: единый модуль `supabase/functions/_shared/recipeBenefitDescription.ts` (реэкспорт в `src/utils/recipeBenefitDescription.ts`); **канонический `recipes.description` в БД** = тот же builder (не LLM / не `recipeDescriptionComposer`); текст пользы **универсальный** (только `nutrition_goals` + seed), **без** child/adult/family в пулах; контекстным остаётся только **заголовок** блока (`getBenefitLabel` по возрасту/профилю)
- [ ] Stage 4.4 — Cultural / Cuisine-aware Pool Ranking (metadata + soft scoring in generate-plan; see section below)
- [ ] Stage 5 — plan page refactor

## Stage 4.3.6 — Deterministic benefit description (UI + БД)

**Статус:** завершено; **расширено:** `recipes.description` синхронизирован с benefit-builder.

**Не путать с** устаревшим глобальным `recipeDescriptionComposer` (meal/ingredient/title): для канонического описания в проде он **не** используется; LLM может по-прежнему возвращать поле `description` в JSON для схемы/эвристик, но **финальное значение в БД и в ответе Edge после санитизации** задаётся только `buildRecipeBenefitDescription`.

- **Где (UI):** страница рецепта (`RecipePage`), карточка в чате (`ChatRecipeCard` / `RecipeHeader`), превью слота в дневном плане (`MealCard` compact + `RecipeCard` preview), `FavoriteRecipeSheet`, welcome-блок.
- **Где (persist):** `createRecipe` в `useRecipes.tsx` (после RPC — `UPDATE recipes.description` с seed по `recipe.id`), `deepseek-chat` при автосохранении рецепта (после `create_recipe_with_steps` — такой же update). Исключение: `source === 'manual'` — описание из формы, benefit-builder не перезаписывает.
- **Вход (текст пользы):** только `nutrition_goals` (или `inferNutritionGoals` по тексту рецепта на Edge/клиенте) + стабильный seed: **после сохранения** — `recipe.id`; до сохранения в чате — `resolveBenefitDescriptionSeed` (`chatMessageId:title` или `title:title`, см. `ChatRecipeCard`). **Профиль child/adult/family в текст не входит** — удалены отдельные пулы и `resolveBenefitProfileContext` для description.
- **Контекст только в UI:** подпись над блоком («Польза для ребёнка» / «Почему это полезно» и т.д.) — `getBenefitLabel` и возраст/профиль там, где уже было. **Расхождение seed до сохранения:** в JSON ответа Edge stableKey = `` `${requestId}:${title}` ``, в карточке чата — `assistantMessageId:title`, пока нет `recipe_id`; после сохранения БД и UI согласованы по `recipe.id`.
- **Детерминизм:** FNV-1a от `recipeId|goals` или `stableKey|goals` (до появления id).
- **Приоритет акцентов / fallback:** без изменений (см. `pickPriorityAccentGoals` в модуле).
- **Sync (implementation):** пулы фраз живут в `_shared/recipeBenefitDescription.ts` (тёплый бытовой тон, без канцелярита; обновляются целиком при смене копирайта); максимальная длина текста после склейки — **220** символов (`BENEFIT_DESCRIPTION_MAX_LENGTH`); фронт импортирует реэкспорт из `src/utils/recipeBenefitDescription.ts`.

### Follow-up: `chef_advice` (аудит, без реализации в этой задаче)

Текущий пайплайн смешивает сырой вывод модели, эвристики `sanitizeChefAdviceForPool` / `enforceChefAdvice` и заготовки `buildChefAdviceFallback`; качество часто «шумное» (повторы, обрывки, несогласованность с шагами). Отдельная задача: сузить контракт, убрать дубли с блоком пользы или ввести детерминированный слой по аналогии с description — **в этом changeset не делалось**.

## Stage 4.4 — Cultural / Cuisine-aware Pool Ranking

**Статус:** в работе — **Stage 4.4.1 завершён** (метаданные + эвристика при save); **4.4.2–4.4.4** впереди. **Не является частью multilang rollout** — это слой **pool / ranking architecture** для общего пула рецептов.

### Проблема: cultural pollution shared pool

Когда пользователи одной языковой/культурной группы массово генерируют узкоспецифичные рецепты, эти рецепты накапливаются в **общем** пуле и из-за сигналов доверия/скора начинают **без причины** чаще попадать в day/week plan **другим** пользователям — даже если для них блюдо воспринимается как «чужое» или нишевое. Этап **не** про запрет кухонь и **не** про привязку языка к кухне.

### Разделение понятий: language ≠ cuisine; locale ≠ proxy для cuisine

- **Язык контента / locale** (`recipes.locale`, `recipe_translations`, UI locale) — про **какой текст** показывать. Это **не** сигнал «какая кухня у пользователя».
- **Кухня / регион / «знакомость»** — отдельные **культурные** метаданные рецепта для **мягкого** ранжирования в подборе плана.
- **Нельзя** использовать `locale` как proxy для cuisine: пользователь с `ru` UI может хотеть привычную международную кухню и наоборот.

### Принципы первого прохода (MVP)

- **Лёгкие метаданные:** хранить на рецепте компактные поля (или совместимый путь `metadata` / `tags`, если так быстрее и чище), **без** тяжёлой нормализованной таксономии на первом шаге.
- **Никаких жёстких фильтров по кухням** в пуле: исключения по культуре **не** вводим; только **скоринг**.
- **Никакой LLM-классификации в рантайме** плана и **никаких дополнительных токенов** на определение familiarity при генерации меню.
- **Интеграция:** только **scoring** внутри `generate-plan` (переупорядочивание внутри групп доверия), **без** отдельного UI на первом проходе.
- **Цель этапа:** уменьшить **доминирование** культурно далёких рецептов в общем ранжировании, **не** устранять разнообразие и **не** блокировать рецепты полностью.

### Целевая минимальная модель данных (первый проход)

На `recipes` (или эквивалентный jsonb/metadata, если выберем это для скорости):

| Поле | Назначение |
|------|------------|
| **cuisine** | Грубая метка кухни (строка / короткий enum-текст без отдельной таблицы справочников на MVP). |
| **region** | Опционально: регион/школа внутри кухни или «широкий» географический якорь (без нормализации). |
| **familiarity** | Одна из: `classic` \| `adapted` \| `specific` — прикладная шкала для ranking (см. ниже). |

Позже допускается вынесение в нормализованные таблицы; **в Stage 4.4** — не требуется.

### Familiarity (MVP): типы и интерпретация

Используем **прикладную** шкалу для ранжирования (не «modern/experimental»):

| Значение | Смысл |
|----------|--------|
| **classic** | Массово понятный, привычный рецепт для широкой аудитории; повседневные знакомые ингредиенты и подача. |
| **adapted** | Культурно окрашенный рецепт, но уже понятный и приемлемый для широкой аудитории; может иногда попадать в общий план без ощущения «это чужое/нишевое». |
| **specific** | Явно культурно/регионально специфичный рецепт; **не должен доминировать** в shared pool ranking для широкой аудитории без дополнительных сигналов (профиль «хочу эту кухню», ручной промоут и т.д. — будущее). |

### Как задаётся familiarity на первом проходе (safe-first, без LLM в рантайме)

- Значение выставляется **эвристически** при **создании/сохранении** рецепта и/или в **отдельном backfill/normalization** job позже — **не** при каждом `generate-plan`.
- **Правила (ориентир):**
  - Нет `cuisine` или значение вроде **neutral / common / local-default** → чаще **`classic`**.
  - Известная, широко знакомая кухня, но **не** дефолтная для основной аудитории продукта → **`adapted`**.
  - Узкая/этнически специфичная кухня → **`specific`**.
  - Данных недостаточно → **safe default: `adapted`** (нейтральный для скоринга: не бустим как «универсальную классику», но и не наказываем как «узкую специфику»; снижает риск ложных `classic` и резких перекосов).

### Семантика scoring для будущей реализации (`generate-plan`)

- **Приоритет доверия сохраняется:** порядок групп **trusted → starter/seed → candidate** (как сейчас задумано в пуле); культурные сигналы **не** пересекают границы групп доверия.
- **Внутри одной trust-группы** культурные сигналы только **переупорядочивают** кандидатов.
- **classic** — небольшой **boost**.
- **adapted** — **нейтрально** или очень малый boost (согласовать константы при реализации).
- **specific** — **мягкий штраф** (soft penalty), **не** exclusion из пула.
- **Несовпадение cuisine** с ожидаемым профилем (когда появится явный сигнал пользователя) **не** блокирует рецепт полностью; до появления профиля — штраф/буст только по familiarity, без «жёсткого» mismatch по locale.
- **Задача:** уменьшить доминирование культурно далёких рецептов, **сохранить** разнообразие.

### Open questions / risks (Stage 4.4)

- **Перепутать locale и cuisine** — приведёт к неверным штрафам и дискриминации по языку UI.
- **Слишком жёсткий penalty для `specific`** — вытеснит легитимное разнообразие; держим **soft** penalty.
- **Переусложнить taxonomy** раньше времени — сопротивляемся отдельным нормализованным таблицам на MVP.
- **Шумные эвристики на старте** — много `adapted` по умолчанию и итерации по спискам кухонь; логирование для валидации.
- **Почему не жёсткая сегментация по language:** язык — про отображение текста; общий пул **мультиязычный**; сегментация по language ломает продукт и смешивает задачи i18n и кухни.

### Checklist

- [x] **Stage 4.4.1** — recipe cultural metadata foundation (колонки `cuisine`/`region`/`familiarity`; CHECK; `infer_cultural_familiarity` в БД; TS `inferCulturalFamiliarity` + `create_recipe_with_steps`; каноникализация Edge + `src/utils`; без backfill старых строк; без UI)
- [ ] **Stage 4.4.2** — generate-plan cultural relevance scoring (внутри trust groups; boost/penalty по familiarity)
- [ ] **Stage 4.4.3** — logging and validation (метрики, сэмплы, сравнение до/после)
- [ ] **Stage 4.4.4** — финальный sync docs при закрытии Stage 4.4 (при необходимости — доп. архитектурные заметки)

### Stage 4.4.1 — Cultural metadata foundation (completed)

- **Миграция:** `supabase/migrations/20260321100000_recipe_cultural_metadata_stage441.sql` — `recipes.cuisine`, `recipes.region`, `recipes.familiarity` (nullable), `recipes_familiarity_check`; функция `public.infer_cultural_familiarity(text)`; обновлён `create_recipe_with_steps` (payload: опциональные `cuisine`, `region`, `familiarity`; при отсутствии `familiarity` — вывод из `infer_cultural_familiarity(cuisine)`).
- **TS (детерминированно, зеркало SQL):** `supabase/functions/_shared/inferCulturalFamiliarity.ts`, `src/utils/inferCulturalFamiliarity.ts`.
- **Каноникализация:** `supabase/functions/_shared/recipeCanonical.ts`, `src/utils/recipeCanonical.ts` — опциональные поля; всегда передаётся вычисленный `familiarity` (явный или через `inferCulturalFamiliarity`); `cuisine`/`region` только если заданы.
- **Типы:** `src/integrations/supabase/types.ts` — поля на `recipes`.
- **Документация:** `docs/database/DATABASE_SCHEMA.md` — колонки и RPC.
- **Не сделано намеренно:** backfill, UI, scoring в `generate-plan`.

---

## Next implementation prompt (рекомендация для Stage 4.4.2)

В `supabase/functions/generate-plan/index.ts`: при выборе из пула учитывать `recipes.familiarity` (и при необходимости `cuisine`) только как **мягкий** reorder внутри trust-групп; не ломать trust → score; лог для валидации. Константы boost/penalty согласовать с разделом «Семантика scoring» выше.

---

## Stage 4.3.5 — Goal chips motion (subtle)

- `PlanGoalChipsRow`: Tailwind `transition-[transform,background-color,border-color,color,box-shadow] duration-200 ease-out`; выбранный чип — чуть плотнее фон, лёгкая тень; все интерактивные чипы с фиксированным `border-2` (без layout shift). Framer Motion не используется.

## Stage 4.3.4 — Goals UI cleanup (plan)

- `MealPlanPage`: строка «Подобрано с акцентом на…» удалена; дисклеймер «Не нашли точных совпадений…» тоже убран (Stage 4.3.4 follow-up).
- `PlanGoalChipsRow`: до трёх чипов в свёрнутом виде + «…» (разворот полного списка); при выборе цели не из первых трёх она показывается в свёртке; selected = заливка + более жёсткая рамка, unselected = outline, низкий контраст; без лишней рамки вокруг ряда.
- `MealCard` / `RecipeCard` preview: только чипы целей (`NutritionGoalsChips`, до 3 в превью); без бейджа «Под вашу цель» и без `getGoalShortDescription` под карточкой.

## Stage 4.3.3 — Goal impact visible (plan UI) — superseded by 4.3.4 for copy density

Ранее: бейдж «Под вашу цель», `getGoalShortDescription`, строка «Подобрано с акцентом…». В 4.3.4 убрано для спокойного UI; логика подбора и скоринга не менялась.

## Stage 4.3.2 — Goal selector access (Free vs Premium/Trial)

- `PlanGoalChipsRow`: при `!hasAccess` не-«Баланс» чипы с пониженной непрозрачностью, клик открывает paywall; 🔒 у подписи; `balanced` как раньше.
- `selectGoalForEdge(hasAccess, selection)` в `planGoalSelect.ts` — в Edge не уходит `selected_goal` для Free.
- `MealPlanPage`: `selectedGoalForGeneratePlan` через `selectGoalForEdge`; при потере доступа сброс выбора на «Баланс».
- `usePlanGenerationJob`: повторная санитизация `params.selected_goal` через `selectGoalForEdge(hasAccess, …)` во всех телах запросов.

## Stage 4.3.1 — Plan hint + paywall copy (UI only)

- `PlanModeHint` (семейный режим): основной текст «✨ Умное меню…», подзаголовок «Без лишних настроек…», переносы (`whitespace-normal break-words`), без `truncate`; режим одного профиля — перенос без обрезки.
- `Paywall`: первый пункт списка преимуществ — «Меню, адаптированное под вашего ребёнка»; кастомное сообщение и список — перенос строк, без обрезки.

## Stage 4.3 — Family-aware scoring

**DONE** (логика только в `supabase/functions/generate-plan/index.ts`; схема БД и UI не менялись).

- **Исключение младенцев младше 1 года** из возрастного бонуса (`age_months` < 12): на `age_bonus` не влияют; фильтры пула и правила infant/toddler из существующего кода не отключались.
- **Toddler soft-mode:** при `hasToddler` (любой член с `age_months` < 36) — мягкий бонус к рецептам с `gentle_digestion` / `balanced` (cap +2), без фильтрации пула.
- **Возрастные бонусы** по группам (только участники с возрастом ≥12 мес): toddler 12–35 мес, child 36–119 мес, adult ≥120 мес; сумма по членам семьи, cap +3 на рецепт.
- **Агрегация семьи:** флаги и eligible-члены из списка `members` (семья — все строки; одиночный профиль — один член).
- **Скоринг:** `final_score = base_score + goal_bonus + age_bonus + soft_bonus`; при равенстве — приоритет goal → age → soft.

Лог: `CHAT_PLAN_FAMILY_DEBUG` (`hasInfant`, `hasToddler`, `members_count`, `age_groups_distribution`, `avg_age`, `total_age_bonus`, `total_soft_bonus`).

## Stage 4.2 — SMART GOAL PRIORITIZATION (GENERATE-PLAN)

Цель: выбор цели в плане заметно влияет на подбор, без жёстких фильтров и пустых слотов.

Checklist (в `supabase/functions/generate-plan/index.ts`):
- [x] Вместо сужения пула `preferGoalFirst` — **скоринг**: `final_score = base_score + goal_bonus` (base = `scoreRecipeForSlot`, без удаления).
- [x] При `selected_goal` (не `balanced`): +2 если в рецепте есть эта цель; иначе +1 если есть `balanced`; иначе 0; мягкое разнообразие: если цель `g` уже встретилась **≥2** раза в этом дне — **−2** к `goal_bonus` за каждую такую цель в составе рецепта.
- [x] Кандидаты сортируются по `final_score` по убыванию, берётся лучший; порядок фильтров: аллергии/профиль → meal-type и **обед = супы** → скоринг.
- [x] Лог `CHAT_PLAN_GOAL_DEBUG` (при заданном `selected_goal`): `selected_goal`, `count_selected_goal` / `count_balanced` в пуле, `total_candidates`, `day_usage_selected`.
- [x] Без изменений схемы БД, RPC, UI, `nutritionGoals.ts`.

## Stage 4.1 — GOALS UX + PLAN INTEGRATION

Цель: цели питания везде понятны пользователю, влияют на подбор плана, без усложнения архитектуры.

Checklist:
- [x] Единый mapping подписей `GOAL_LABELS` в `src/utils/nutritionGoals.ts` (ключи БД не менялись; поддержаны короткие алиасы для UI).
- [x] Превью карточек (план, избранное): до 2 чипов целей под блоком времени/КБЖУ (`NutritionGoalsChips` + `maxVisible={2}` в preview).
- [x] Вкладка план: single-select чипы цели под строкой «Учитываем все особенности профиля»; по умолчанию выбран «Баланс»; повторный клик по активному чипу — сброс (`null`); не multi-select.
- [x] `generate-plan`: опциональный `selected_goal` (ключ БД). **Stage 4.2:** скоринг и разнообразие по дню (см. Stage 4.2); ранее — сужение пула; заменено на бонус к скору. Обед: по-прежнему только супы (фильтр до скоринга).
- [x] RPC `get_recipe_previews` возвращает `nutrition_goals` для превью в плане (миграция). До применения миграции фронт подмешивает `nutrition_goals` из параллельного `select` по `recipes` в `useRecipePreviewsByIds` (как для КБЖУ).

Примечания:
- Single goal selection only (не multi-select).
- Simple priority logic (подмножество кандидатов при наличии), не ML и не отдельные таблицы.

## Stage 4 — GOALS SYSTEM

Checklist:
- [x] `recipes.nutrition_goals` added (jsonb, whitelist check, default `[]`)
- [x] rule-based inference implemented (`inferNutritionGoals`)
- [x] goals saved via `create_recipe_with_steps`
- [x] goals shown in UI (recipe card/page/favorites)
- [x] generate-plan uses goals (daily balanced + weekly distribution + optional user-goal priority)
- [x] minimal approach kept (no admin panel, no complex scoring)

### Stage 4 notes

- No admin panel.
- No ML/AI goals classifier (rule-based only).
- No complex scoring system (small goal bonuses/penalties only).
- No separate goals tables.

### Stage 2.5 — Recipe Pool & Feedback System

Checklist:
- [x] recipe_feedback table added
- [x] plan-based signals implemented
- [x] scoring added
- [x] trust auto rules added
- [x] generate-plan uses score
- [x] operational workflow added

### Stage 2.5.1 — Feedback Stabilization

Checklist:
- [x] one vote per user implemented
- [x] vote toggle logic implemented
- [x] repeated vote ignored
- [x] UI vote state added
- [x] scoring formula softened
- [x] trust thresholds updated

### Stage 2.5.2 — Pool Stabilization

Checklist:
- [x] trusted safety rule added
- [x] vote system verified
- [x] score stability verified
- [x] plan signals validated
- [x] generate-plan priority confirmed
- [x] locale flow verified
- [x] docs updated

### Stage 2.5.3 — Cold Start Protection

Checklist:
- [x] cold start protection implemented
- [x] block disabled for low-vote recipes
- [x] future trust degradation documented
- [x] future plan signal limits documented
- [x] seed pool strategy documented

## Stage 1 scope
- [x] migration added
- [x] recipes.locale added
- [x] recipes.source_lang added
- [x] recipes.trust_level added
- [x] trust_level backfill added
- [x] locale backfill added
- [x] create_recipe_with_steps updated
- [x] deepseek-chat passes locale/trust metadata
- [x] generate-plan: pool excludes blocked (generate-plan не создаёт рецепты; только фильтрация пула при выборке)
- [x] docs updated

## Key files
- **supabase/migrations/20260316120000_recipe_locale_trust_level_stage1.sql** — миграция: колонки locale, source_lang, trust_level; CHECK; backfill; новая версия create_recipe_with_steps.
- **supabase/migrations/** — RPC create_recipe_with_steps определён в миграции выше (полная замена функции).
- **supabase/functions/deepseek-chat/index.ts** — передача locale, source_lang, trust_level в canonicalizeRecipePayload при сохранении chat recipe.
- **supabase/functions/_shared/recipeCanonical.ts** — опциональные поля locale, source_lang, trust_level в CanonicalizeRecipePayloadInput и в возвращаемом payload.
- **supabase/functions/generate-plan/index.ts** — fetchPoolCandidates: фильтр .or("trust_level.is.null,trust_level.neq.blocked").
- **docs/database/DATABASE_SCHEMA.md** — описание колонок recipes.locale, source_lang, trust_level и контракта create_recipe_with_steps.

## What was actually changed
1. **Миграция 20260316120000:** добавлены колонки `recipes.locale` (NOT NULL DEFAULT 'ru'), `recipes.source_lang`, `recipes.trust_level`; CHECK для trust_level; backfill trust_level по source (seed/starter → одноимённый, manual → trusted, chat_ai/week_ai → candidate, user_custom → trusted, иначе → candidate); backfill locale = 'ru'; RPC create_recipe_with_steps расширен приёмом опциональных locale (default 'ru'), source_lang (null), trust_level (по source).
2. **deepseek-chat:** в вызов canonicalizeRecipePayload добавлены locale: 'ru', source_lang: null, trust_level: 'candidate'.
3. **_shared/recipeCanonical.ts:** в интерфейс и возврат canonicalizeRecipePayload добавлены опциональные locale, source_lang, trust_level (проброс в payload только если заданы).
4. **generate-plan:** в fetchPoolCandidates добавлен фильтр .or("trust_level.is.null,trust_level.neq.blocked") — рецепты с trust_level = 'blocked' не попадают в пул; старые записи с trust_level IS NULL продолжают участвовать.
5. **DATABASE_SCHEMA.md:** описание новых колонок и обновлённый контракт create_recipe_with_steps.

## Review / Where to look if something breaks
- **Создание chat recipe** — deepseek-chat → create_recipe_with_steps с locale/trust_level; ответ API без изменений.
- **Week/day generation** — generate-plan только читает пул; фильтр по trust_level не должен убирать старые записи (NULL допускается).
- **Replace slot** — использует тот же fetchPoolCandidates, логика единая.
- **Pool selection** — единственная выборка пула в generate-plan: fetchPoolCandidates; проверить, что рецепты с trust_level = blocked не возвращаются.
- **Recipe read flow** — get_recipe_full / get_recipe_previews не менялись; UI читает title/description как раньше.
- **Regressions in recipe save** — вызовы create_recipe_with_steps без новых полей остаются валидными (RPC подставляет дефолты).

## Stage 2 scope
- [x] description composer module added
- [x] deterministic description generation implemented
- [x] key ingredient selection implemented (pickKeyIngredients; used for category inference, templates do not repeat title)
- [x] fallback description implemented (COMPOSER_FALLBACK + category default)
- [x] deepseek-chat uses composer for final description
- [x] prompt dependence on full description reduced (LLM description overwritten by composer; repair/buildRecipe/buildDescriptionFallback in validated path replaced by composer)
- [x] docs updated (this progress file)

## Stage 2 key files
- **supabase/functions/_shared/recipeDescriptionComposer.ts** — модуль composer: pickKeyIngredients, inferDishCategory, composeRecipeDescription; шаблоны по категориям (soup, porridge, pancake, casserole, stew, pasta, meatballs, salad, drink, default).
- **supabase/functions/deepseek-chat/index.ts** — импорт composeRecipeDescription; в блоке validated при отсутствии/плохом description подстановка через composer (вместо repair/buildRecipe/buildDescriptionFallback); при провале quality gate — подстановка через composer; финальная подстановка description для response recipe через composer; assistantMessage обновляется после мутации recipe; лог RECIPE_SANITIZED с descriptionSource: "composer".

## Stage 2: what was actually changed
1. **recipeDescriptionComposer.ts:** новый модуль. pickKeyIngredients — исключает воду, соль, масло, специи и т.п.; возвращает до 2 ключевых. inferDishCategory — по title, mealType, is_soup, ingredientNames. composeRecipeDescription — выбор шаблона по категории, seed из title+ingredients+mealType, возврат ≤210 символов; fallback при пустоте.
2. **deepseek-chat/index.ts:** при отсутствии/неполном/плохом description в validated path — description задаётся через composeRecipeDescription (убраны вызовы repairDescriptionOnly, buildRecipeDescription, buildDescriptionFallback из этого пути). При провале quality gate — подстановка через composer вместо repair/buildDescriptionFallback. После санитизации response recipe: description = composeRecipeDescription(recipe); assistantMessage = JSON.stringify(recipe). Удалены импорты buildRecipeDescription, buildDescriptionFallback. В лог RECIPE_SANITIZED добавлено descriptionSource: "composer".
3. **Промпт LLM:** не менялся. Description по-прежнему запрашивается в ответе модели; финальное значение всегда перезаписывается composer'ом (минимальный риск, без изменения контракта ответа).

## Stage 2: review / where to look if something breaks
- **Генерация рецепта в чате** — description в ответе и в БД от composer; короткий, не дублирует title.
- **Сохранение рецепта** — payload.description берётся из validatedRecipe.description (уже от composer).
- **RecipePage / избранное / план** — чтение description без изменений; контракт поля сохранён.
- **Replace slot / пул** — без изменений.
- **Quality-gate path** — при провале gate по description всё ещё вызывается repairDescriptionOnly в одном месте (до полного retry); затем финальный description перезаписывается composer'ом в блоке response.

## Stage 2: open questions
- **Промпт:** description из ответа LLM не удалялся; финальное значение всегда от composer. При желании в следующем этапе можно сократить промпт (убрать требование 2 предложений о пользе) и зафиксировать экономию токенов.
- **Ключевые ингредиенты:** в текущих шаблонах composer не вставляет названия ингредиентов в текст (описание дополняет title, не повторяет его); pickKeyIngredients экспортирован для возможного использования в шаблонах позже.

## Stage 2.1 scope (composer polishing & token reduction)
- [x] description templates expanded (more per category, semantic axes: texture, serving, home-style, light, family)
- [x] repetition reduced (more variants, combo-style phrases)
- [x] fallback-only phrases isolated (generic "Спокойный домашний вариант на каждый день" only in COMPOSER_FALLBACK)
- [x] chef_advice limited (max 220 chars, 1–2 sentences; CHEF_ADVICE_MAX_LENGTH 280→220)
- [x] description removed or reduced in prompt (LLM may output ""; prompts shortened)
- [x] token usage reduced (shorter prompt, no long description requirement)
- [x] composerVariant logged (category:index)

## Stage 2.1 key files
- **supabase/functions/_shared/recipeDescriptionComposer.ts** — max 160 chars; ComposeRecipeDescriptionResult { text, variantId }; expanded templates; fallback-only single phrase.
- **supabase/functions/deepseek-chat/prompts.ts** — RECIPE_STRICT_JSON_CONTRACT, RECIPE_SYSTEM_RULES_V3: description optional/empty; chefAdvice max 220, practical tone.
- **supabase/functions/deepseek-chat/domain/recipe_io/sanitizeAndRepair.ts** — CHEF_ADVICE_MAX_LENGTH 220; CHEF_ADVICE_RESTAURANT_PHRASES; hasRestaurantTone → fallback.
- **supabase/functions/deepseek-chat/recipeSchema.ts** — chefAdvice max 220; comment updated.
- **supabase/functions/deepseek-chat/index.ts** — composeRecipeDescription returns { text, variantId }; log composerVariant.

## Stage 2.1: actual result / open questions
- Stage 2.1 дал спорный результат по chef_advice: скорость генерации заметно не выросла; качество chef_advice просело (советы менее живые, иногда не по блюду или механические). Stage 2.2 возвращает качество и добавляет consistency guard.

## Stage 2.2 scope (chef advice restore + consistency guard)
- [x] chef_advice rules softened (max 260, убраны жёсткие запреты «подавайте»/«можно»; RESTAURANT_PHRASES сокращён до явного пафоса)
- [x] chef_advice quality improved (промпт: живой тон, 2–3 предложения, по блюду; anti-garbage только против нерелевантности/пустых шаблонов)
- [x] title/ingredients consistency guard added (high-signal ключи: картофель, цветная капуста, брокколи, кабачок, морковь, яблоко, банан, творог, индейка, курица, треска, лосось, гречка, овсянка, рис, тыква, фасоль, сыр, яйцо, томат/помидор)
- [x] obvious title/ingredients mismatches handled (при отсутствии картофеля в ingredients — безопасная нормализация title, например «картофельное пюре из цветной капусты» → «пюре из цветной капусты»)
- [x] guard logging added (TITLE_INGREDIENT_CONSISTENCY_GUARD: titleIngredientConsistencyGuardTriggered, consistencyMismatchKeys; titleNormalized при применении suggestedTitle; в RECIPE_SANITIZED — titleIngredientConsistencyGuardTriggered, consistencyMismatchKeys)
- [x] docs updated (этот progress-файл)

## Stage 2.2 key files
- **supabase/functions/_shared/titleIngredientConsistencyGuard.ts** — checkTitleIngredientConsistency(title, ingredientNames); high-signal список; suggestTitleFix только для картофеля (убрать прилагательное «картофельное» и т.п.).
- **supabase/functions/deepseek-chat/domain/recipe_io/sanitizeAndRepair.ts** — CHEF_ADVICE_MAX_LENGTH 260; смягчены FORBIDDEN_STARTS и RESTAURANT_PHRASES; quality gate 1–3 предложения.
- **supabase/functions/deepseek-chat/recipeSchema.ts** — chefAdvice max 260.
- **supabase/functions/deepseek-chat/prompts.ts** — chefAdvice 260 симв., 2–3 предложения; живой тон; примеры хорошо/плохо.
- **supabase/functions/deepseek-chat/index.ts** — вызов checkTitleIngredientConsistency после enforceChefAdvice; применение suggestedTitle при наличии; логирование guard и RECIPE_SANITIZED с полями consistency.

## Stage 2.2: уточнение
- Stage 2.2 улучшил chef_advice частично; в pool по-прежнему мог протекать request-specific контекст (в дорогу, с собой и т.д.). Stage 2.3 добавляет anti-leak guard и упрощает description path.

## Stage 2.3 scope (description path cleanup + anti-context leakage + latency audit)
- [x] description removed from critical repair path (descOk не запускает repairDescriptionOnly и не входит в needFullRetry; retry только по adviceOk)
- [x] description-only repair eliminated (вызов repairDescriptionOnly удалён; при плохом description — только composer в блоке validated)
- [x] request-context leakage guard added (title, description, chef_advice; фразы: в дорогу, с собой, в контейнер, в школу, в поездку, для дороги и др.)
- [x] pool-unsafe phrases blocked from saved recipe text (при срабатывании: title — мягкое удаление фразы; description — пересбор composer; chef_advice — fallback)
- [x] title lexicon guard added (соте → тушёные овощи / тушёное; только безопасные замены)
- [x] latency audit instrumentation added (backend: validation_done, LATENCY_AUDIT с total_ms и latencyPhase; frontend: performance.mark chat_request_start, chat_request_sent, chat_response_received, chat_recipe_ready; measure chat_tap_to_recipe_ms)
- [x] docs updated (этот progress-файл)

## Stage 2.3 key files
- **supabase/functions/deepseek-chat/index.ts** — убран repairDescriptionOnly из горячего пути; quality gate retry только по chef_advice; один блок composer для description в validated; импорт и вызов checkRequestContextLeak, checkTitleLexicon; логи DESCRIPTION_QUALITY_GATE_BYPASSED, REQUEST_CONTEXT_LEAK_GUARD, TITLE_LEXICON_GUARD, RECIPE_SANITIZED (leak/lexicon), logPerf validation_done, LATENCY_AUDIT.
- **supabase/functions/_shared/requestContextLeakGuard.ts** — checkRequestContextLeak(title, description, chefAdvice); список REQUEST_CONTEXT_PHRASES; suggestedTitle, descriptionUseComposer, chefAdviceUseFallback.
- **supabase/functions/_shared/titleLexiconGuard.ts** — checkTitleLexicon(title); замены «овощное соте» → «тушёные овощи», «соте» → «тушёное».
- **src/hooks/useDeepSeekAPI.tsx** — performance.mark: chat_request_start, chat_request_sent, chat_response_received, chat_recipe_ready; performance.measure chat_tap_to_recipe; safeLog LATENCY_AUDIT с chat_tap_to_recipe_ms.

## Stage 2.4 scope (description rollback — LLM primary)
- [x] LLM description restored as primary source
- [x] composer used only as fallback (when isDescriptionInvalid)
- [x] description validation added (isDescriptionInvalid: пусто, <20, >180, повтор title, запреты, request-context leakage)
- [x] prompt rules updated (1–2 предложения, макс. 160 симв., не повторять название, не «в дорогу»/«для ребёнка»/«для всей семьи», без мед. обещаний)
- [x] latency/guards from Stage 2.3 preserved

## Stage 2.4 key files
- **supabase/functions/deepseek-chat/index.ts** — в validated: только при isDescriptionInvalid(desc) подстановка composer; в response-блоке: descriptionInvalid ? composer : descRaw.slice(0,160); descriptionSource "llm" | "composer_fallback"; при leak.descriptionUseComposer перезапись description и descriptionSource.
- **supabase/functions/deepseek-chat/domain/recipe_io/sanitizeAndRepair.ts** — isDescriptionInvalid(desc, { title }); импорт textContainsRequestContextLeak из _shared.
- **supabase/functions/deepseek-chat/domain/recipe_io/index.ts** — экспорт isDescriptionInvalid.
- **supabase/functions/_shared/requestContextLeakGuard.ts** — textContainsRequestContextLeak(text); фразы «для ребёнка», «для всей семьи» добавлены в REQUEST_CONTEXT_PHRASES.
- **supabase/functions/deepseek-chat/prompts.ts** — RECIPE_STRICT_JSON_CONTRACT и RECIPE_SYSTEM_RULES_V3: description 1–2 предложения, макс. 160, не повторять title, запреты по контексту и мед. обещаниям.

## Stage 2.4.1 scope (steps leakage guard)
- [x] request-context leakage guard extended to steps
- [x] steps cleaned locally without LLM retry (cleanStepFromRequestContextLeak: удаление фраз, fallback «Готово к подаче.» при пустом результате)
- [x] pool-safe recipe text ensured for steps
- [x] logs added (REQUEST_CONTEXT_LEAK_GUARD: stepsLeakDetected, stepsLeakCleaned, stepsLeakCount)

## Stage 2.4.1 key files
- **supabase/functions/_shared/requestContextLeakGuard.ts** — cleanStepFromRequestContextLeak(step); экспорт для использования в index.
- **supabase/functions/deepseek-chat/index.ts** — после обработки title/description/chefAdvice по leak: итерация по recipe.steps, проверка textContainsRequestContextLeak(step), замена на cleanStepFromRequestContextLeak(step); лог REQUEST_CONTEXT_LEAK_GUARD с stepsLeakDetected, stepsLeakCleaned, stepsLeakCount.

## Stage 2.5 key files
- **supabase/migrations/20260317120000_recipe_feedback_and_score_stage25.sql** — таблица recipe_feedback; recipes.score; recompute_recipe_score_and_trust; триггер; RLS; record_recipe_feedback; обновлён assign_recipe_to_plan_slot (feedback при добавлении/замене).
- **supabase/functions/generate-plan/index.ts** — fetchPoolCandidates: select score, trust_level; сортировка trust → score DESC; при replace_slot и при fill дня/недели вызов record_recipe_feedback (added_to_plan, replaced_in_plan).
- **src/hooks/useMealPlans.tsx** — deleteMealPlan: перед удалением слота вызов record_recipe_feedback(recipe_id, 'removed_from_plan').
- **src/pages/RecipePage.tsx** — кнопки 👍 / 👎 (like/dislike), вызов record_recipe_feedback для рецептов пула (не user_custom).
- **docs/operations/recipe-pool-trust-workflow.md** — операционный workflow: trusted/blocked правила, ручная модерация, подготовка пула.

## Stage 2.5.1 key files
- **supabase/migrations/20260317140000_recipe_feedback_vote_guard_stage251.sql** — get_recipe_my_vote; record_recipe_feedback: один голос на (recipe_id, user_id), повторный тот же голос no-op, toggle like↔dislike; recompute: формула +2*likes −2*dislikes +1*added −0.5*replaced −0.5*removed; trusted score≥8, likes≥2, dislikes≤1; blocked dislikes≥4 or score≤−6; триггер AFTER DELETE для пересчёта.
- **src/pages/RecipePage.tsx** — userVote state, get_recipe_my_vote при загрузке, повторный тап не вызывает API и не показывает toast, toggle обновляет состояние и кнопки (активное выделение).

## Stage 2.5.2 key files
- **supabase/migrations/20260317160000_recipe_trust_safety_score_clamp_stage252.sql** — recompute: явная ветка для trusted (только обновление score, без auto-block); score clamp [-10, 50]; candidate по-прежнему по правилам.
- **supabase/functions/generate-plan/index.ts** — комментарий к fetchPoolCandidates: blocked исключены, приоритет trusted → starter/seed → candidate, затем score DESC.
- **docs/operations/recipe-pool-trust-workflow.md** — Trusted safety, Early-stage rule, Launch strategy (RU), clamp в формуле.

## Stage 2.5.3 key files
- **supabase/migrations/20260317180000_recipe_cold_start_protection_stage253.sql** — recompute: total_votes = likes + dislikes; для candidate блокировка применяется только при total_votes >= 3.
- **docs/operations/recipe-pool-trust-workflow.md** — cold start в правиле blocked; Seed pool (manual); FUTURE: trust degradation, plan signal limiting.

## Stage 2.5.2 verification (vote, plan, locale)
- **Vote:** record_recipe_feedback — повторный тот же голос no-op; toggle удаляет старый и вставляет новый; один пользователь даёт не более одного like или одного dislike на рецепт. Двойной подсчёт исключён.
- **Plan:** added_to_plan для нового рецепта; replaced_in_plan только для старого (assign_recipe_to_plan_slot и generate-plan). Повторный remove пишет новую строку (история).
- **Generate-plan:** пул по .or("trust_level.is.null,trust_level.neq.blocked") — blocked не попадают; сортировка trust → score DESC; candidate остаются в пуле.
- **Locale:** deepseek-chat передаёт locale: 'ru' в create_recipe_with_steps; RPC и таблица recipes — locale NOT NULL DEFAULT 'ru'. Готовность к Stage 3 (multilang) без новых таблиц.

## Stage 3 scope (recipe_translations + locale-aware reads)

Checklist:
- [x] recipe_translations table added (id, recipe_id, locale, title, description, chef_advice, translation_status, source, created_at, updated_at; UNIQUE(recipe_id, locale); CHECKs; RLS read-only via RPC)
- [x] get_recipe_previews(recipe_ids, p_locale text DEFAULT NULL) — locale fallback for title/description
- [x] get_recipe_full(p_recipe_id, p_locale text DEFAULT NULL) — locale fallback for title, description, chef_advice
- [x] Client hooks accept optional locale (useRecipePreviewsByIds, useFavorites, useMyRecipes); calls without locale unchanged
- [x] Steps/ingredients translations not implemented (foundation only for title/description/chef_advice)
- [x] create_recipe_with_steps and save flows not changed
- [x] docs updated

### Stage 3 key files

- **supabase/migrations/20260318120000_recipe_translations_stage3.sql** — таблица recipe_translations, индекс, триггер updated_at, RLS (без SELECT-политик для клиента).
- **supabase/migrations/20260318130000_get_recipe_previews_full_locale_stage3.sql** — RPC get_recipe_previews(recipe_ids, p_locale), get_recipe_full(p_recipe_id, p_locale); LEFT JOIN recipe_translations, COALESCE(NULLIF(trim(rt.*), ''), r.*).
- **src/hooks/useRecipePreviewsByIds.ts** — опциональный параметр locale, передача p_locale в RPC.
- **src/hooks/useFavorites.tsx** — options.locale, передача p_locale в get_recipe_previews.
- **src/hooks/useMyRecipes.ts** — опциональный параметр locale, передача p_locale в get_recipe_previews.
- **src/integrations/supabase/types.ts** — Args с p_locale для get_recipe_full и get_recipe_previews.
- **docs/database/DATABASE_SCHEMA.md** — описание recipe_translations и обновлённые сигнатуры RPC.

### Stage 3: what was actually changed

1. **recipe_translations:** таблица для переводов по (recipe_id, locale); переводы заполняются отдельно (импорт/админка/автоперевод), backfill не требуется.
2. **get_recipe_previews:** добавлен p_locale; при p_locale выполняется LEFT JOIN с recipe_translations, title/description = COALESCE(NULLIF(trim(rt.*), ''), r.*); без p_locale поведение как раньше.
3. **get_recipe_full:** то же для title, description, chef_advice; шаги и ингредиенты без локализации.
4. **Клиент:** хуки могут принимать locale и передавать p_locale; при вызове без locale всё работает по-старому.
5. **Create/save flows:** не менялись; контент по умолчанию по-прежнему в recipes.

### Stage 3: review / where to look if something breaks

- **Вызов get_recipe_previews без p_locale** — старое поведение (только recipes).
- **Вызов get_recipe_full без p_locale** — старое поведение.
- **С p_locale при отсутствии перевода** — fallback на recipes.title/description/chef_advice.
- **RecipePage / избранное / план** — после ML-4: getRecipeById загружает через get_recipe_full(id, locale) + recipe_ingredients + servings; превью везде передают p_locale (getAppLocale()). См. блок ML-4 ниже.
- **Share/public (get_recipe_by_share_ref)** — не менялся; при необходимости p_locale можно добавить позже.
- **TS/сборка** — типы RPC обновлены (p_locale опционален).

## Rollout roadmap (после Stage 3)
- Дальнейшие шаги мультиязычности зафиксированы в **docs/refactor/recipe-multilang-rollout-stages.md**: стадии **ML-4 … ML-9** (locale plumbing → translations for new recipes → backfill → steps/ingredients → locale-aware generation → UI i18n). **ML-4 реализован** (см. ниже).

## ML-4 status (Locale plumbing — implemented)

- **Цель:** подключить locale в клиенте так, чтобы переводы реально использовались при чтении.
- **Источник locale:** единый helper `getAppLocale()` (src/utils/appLocale.ts): `navigator.language` → первый сегмент (например en-US → en), fallback `'ru'`.
- **Locale-aware reads подключены в:**
  - превью карточек — useRecipePreviewsByIds (effectiveLocale = locale ?? getAppLocale(), p_locale в RPC);
  - избранное — useFavorites (effectiveLocale, p_locale в get_recipe_previews);
  - мои рецепты — useMyRecipes (effectiveLocale, p_locale в get_recipe_previews);
  - полный рецепт / RecipePage — useRecipes().getRecipeById загружает через get_recipe_full(id, getAppLocale()) (steps_json и ingredients_json уже локализованы в RPC) + servings_base/servings_recommended (отдельный select); контракт для UI сохранён (title, description, chef_advice, steps, ingredients, servings_base, servings_recommended и др.).
- **Fallback на recipes.*** сохраняется (RPC и при отсутствии записей в recipe_translations).
- **Create/save flows** не менялись; запись в recipe_translations не добавлена.
- **Share/public flow:** ML-7: get_recipe_by_share_ref(p_share_ref, p_locale); клиент передаёт getAppLocale() (publicRecipeShare.ts).

### ML-4 checklist

- [x] locale source selected (getAppLocale: navigator.language → first segment, fallback ru)
- [x] previews pass p_locale (useRecipePreviewsByIds)
- [x] favorites pass p_locale (useFavorites)
- [x] my recipes pass p_locale (useMyRecipes)
- [x] full recipe read updated (getRecipeById → get_recipe_full + ingredients_json + servings)
- [x] locale-aware query keys (previews, favorites, my recipes, recipes detail по id + locale)
- [x] share/public locale-aware read (get_recipe_by_share_ref с p_locale)
- [ ] explicit app language setting (сейчас только navigator.language; настройка в профиле — позже)

## ML-5 status (Translations for new recipes — completed end-to-end)

- **Цель:** после сохранения нового рецепта создавать запись в recipe_translations для целевой локали (если она отличается от базовой), чтобы пользователь с этой локалью видел перевод.
- **Что переводится (после ML-7):** title, description, chef_advice (ML-5) + steps.instruction + ingredients name/display_text (ML-7). См. блок ML-7 ниже.
- **Фактический статус:** ML-5 реально завершён end-to-end. Pipeline создаёт записи в recipe_translations при выполнении условий; новые рецепты после save получают перевод. Root cause проблем при запуске (401 при вызове translate-recipe из deepseek-chat) найден и исправлен: шлюз Supabase проверял JWT при Edge-to-Edge вызове; для translate-recipe задано `verify_jwt = false`, пользовательский контекст передаётся через `__user_jwt` в теле или через заголовок Authorization с клиента.

### Create/save paths и триггеры перевода

| Путь | Где сохраняется рецепт | Кто запускает перевод | Где в коде |
|------|------------------------|------------------------|------------|
| **Client createRecipe** | Клиент: `create_recipe_with_steps` (RPC) | Клиент: `requestRecipeTranslation(recipeId)` | useRecipes.createRecipe **onSuccess** (единственная точка на клиенте) |
| **Backend deepseek-chat** | Бэкенд: deepseek-chat вызывает `create_recipe_with_steps`, возвращает `recipe_id` в ответе | Бэкенд: fire-and-forget вызов Edge `translate-recipe` после успешного save | deepseek-chat/index.ts после присвоения `responseBody.recipe_id` |

Сценарии взаимоисключающие: один и тот же рецепт либо сохраняется клиентом (чат/форма без сохранения на бэке, или редактирование), либо бэкендом (чат с авторизацией, рецепт сохранён в deepseek-chat). Двойного триггера для одного рецепта не возникает.

- **Триггер перевода** работает для обоих путей: client-saved (createRecipe onSuccess → requestRecipeTranslation) и backend-saved (deepseek-chat после create_recipe_with_steps → fire-and-forget translate-recipe).
- **Целевая локаль для backend trigger:** клиент передаёт в теле запроса к deepseek-chat опциональное поле `target_locale` (getAppLocale()) при type chat/recipe; бэкенд использует его при вызове translate-recipe. Если не передано — бэкенд использует `'en'`.
- **Когда перевод не выполняется (skipped):** (1) target_locale совпадает с recipes.locale — переводить не нужно. (2) RPC `has_recipe_full_locale_pack(recipe_id, target_locale)` возвращает true — полный пакет перевода уже есть (ML-7), повторный вызов LLM не делается.
- **Защита от дублей:** (1) Архитектурно: один save path = один trigger. (2) На Edge: RPC `has_recipe_full_locale_pack(recipe_id, target_locale)` перед LLM (ML-7); при полном пакете — `status: 'skipped'`, LLM не вызывается.
- **Логика целевой локали:** getAppLocale() (fallback `'en'`). Перевод создаётся только если target_locale ≠ locale рецепта.
- **Failure-safe:** основной save не зависит от перевода; ответ пользователю не ждёт завершения перевода. Ошибки перевода логируются (клиент — молча, бэкенд — safeWarn).
- **Ответ Edge translate-recipe:** HTTP 200, тело `{ ok: true, status: 'created' | 'skipped' | 'error'[, translated_steps_count, translated_ingredients_count, skipped_steps_count, skipped_ingredients_count ] }`.
- **Пока не покрыто (вне ML-5/ML-7):** старые рецепты (ML-6 deferred); generate-plan не создаёт рецепты — не применимо; мульти-целевые локали; UI i18n.
- **Где смотреть при поломке:** deepseek-chat (блок после savedRecipeId); translate-recipe Edge; useRecipes.tsx onSuccess; useDeepSeekAPI (target_locale в body).

### ML-5 checklist

- [x] RPC upsert_recipe_translation, has_recipe_translation
- [x] Edge translate-recipe (failure-safe, status в ответе)
- [x] Client trigger: только useRecipes.createRecipe onSuccess
- [x] Backend trigger: deepseek-chat после create_recipe_with_steps (fire-and-forget вызов translate-recipe)
- [x] Клиент передаёт target_locale в запросе чата (getAppLocale())
- [x] Дубли исключены: один save path = один trigger; has_recipe_translation на Edge
- [x] Документация обновлена

### Auto-translation feature flag (RU-only rollout)

Перевод рецептов после save **включён только при явном включении** флагов. Для текущего RU-only rollout автоматический перевод **отключён**.

| Где | Переменная | Поведение |
|-----|------------|-----------|
| **Фронт** | `VITE_ENABLE_RECIPE_TRANSLATION` | Если не `"true"`, `requestRecipeTranslation` не вызывается (createRecipe onSuccess не запускает перевод). |
| **Backend (deepseek-chat)** | `ENABLE_RECIPE_TRANSLATION` | Если не `"true"`, fire-and-forget вызов translate-recipe не выполняется. |
| **Edge (translate-recipe)** | `ENABLE_RECIPE_TRANSLATION` | Если не `"true"`, функция сразу возвращает `status: 'skipped'`. |

Дополнительно: перевод не запускается, если `target_locale` не передан или пустой (на бэкенде нет дефолта `'en'`); при явной передаче локали и включённом флаге логика ML-5/ML-7 работает как раньше. ML-5/ML-7 готовы к включению при мультилокальном rollout.

**Где посмотреть и включить/выключить:**
- **Фронт:** переменная задаётся при сборке. Локально: файл `.env` или `.env.local` в корне проекта, строка `VITE_ENABLE_RECIPE_TRANSLATION=true` (включить) или отсутствие строки / `false` (выключить). После изменения — перезапуск `npm run dev` или пересборка. В проде — переменные окружения в CI/CD (GitHub Actions → Variables/Secrets для шага build).
- **Edge (Supabase):** Dashboard → ваш проект → **Edge Functions** → **Secrets** (или **Settings** → **Edge Function Secrets**). Секрет `ENABLE_RECIPE_TRANSLATION` со значением `true` — перевод включён; секрет не задан или значение не `true` — отключён. Применяется к вызовам deepseek-chat и translate-recipe.

### Step numbering (ML-7)

**step_number** хранится канонически в **recipe_steps**; **recipe_step_translations** содержит только instruction. get_recipe_full возвращает steps_json с полями id, step_number (из recipe_steps), instruction (локализованный или fallback); шаги отсортированы по step_number ASC.

### ML-5 deploy и секреты (когда перевод включён)

Чтобы в `recipe_translations` (и в step/ingredient translations) появлялись записи, нужно:

1. **Включить флаги:** на фронте `VITE_ENABLE_RECIPE_TRANSLATION=true`; в Supabase Edge Secrets для deepseek-chat и translate-recipe задать `ENABLE_RECIPE_TRANSLATION=true`.
2. **Задеплоить Edge function `translate-recipe`.** Рекомендуемый способ: `npm run supabase:deploy:chat` или `npm run supabase:deploy:translate-recipe`.
3. **Задать секрет `DEEPSEEK_API_KEY`** для проекта в Supabase. Без этого ключа при вызове функция возвращает 200 с `status: 'error'`.

**Для текущего RU rollout:** флаги не задавать (или задать `false`) — тогда перевод не вызывается и токены не тратятся.

### Note: token spend перевода и логирование

Перевод новых рецептов — отдельный LLM-вызов через Edge function `translate-recipe` (DeepSeek). Он создаёт дополнительный token spend относительно обычного save. Spend происходит только когда реально нужен перевод: если target_locale = recipes.locale или запись в recipe_translations уже есть, LLM не вызывается (status `skipped`).

**Логирование token usage для перевода:** расход на translation логируется отдельно в `token_usage_log` с `action_type = 'recipe_translation'`. Запись выполняется в **translate-recipe/index.ts** после успешного ответа DeepSeek (только когда LLM реально вызывался; при status `skipped` запись в token_usage_log не создаётся). Пишутся поля: user_id, action_type, input_tokens, output_tokens, total_tokens, created_at. Логирование **best-effort**: при ошибке вставки в token_usage_log перевод не откатывается, запись в recipe_translations считается успешной; ошибка логируется в консоль Edge.

### ML-6 deferred / ML-7 scope

**ML-6 backfill отложен.** Массовый перевод старых рецептов в этой задаче не запускается.

**ML-7 реализован как полноценная локализация steps + ingredients без ML-6 backfill:**
- **Цель ML-7:** полный рецепт (title, description, chef_advice, steps, ingredients) читается на выбранной локали с обязательным fallback на базовые данные.
- **Target scope:** только новые рецепты и активные (те, что открываются/сохраняются через текущие flows). Старые рецепты без переводов продолжают работать через fallback; batch translation позже допускается, но не входит в эту задачу.
- **Таблицы:** recipe_step_translations (recipe_step_id, locale, instruction, translation_status, source); recipe_ingredient_translations (recipe_ingredient_id, locale, name, display_text, translation_status, source). RLS включён; прямой SELECT для anon/authenticated не даётся; доступ только через SECURITY DEFINER RPC.
- **RPC:** upsert_recipe_step_translation, upsert_recipe_ingredient_translation; has_recipe_steps_translation, has_recipe_ingredients_translation; has_recipe_full_locale_pack. get_recipe_full(p_recipe_id, p_locale) возвращает локализованные steps_json и ingredients_json (fallback на recipe_steps / recipe_ingredients). get_recipe_by_share_ref(p_share_ref, p_locale) — опциональная локаль для публичной страницы шаринга.
- **Client:** getRecipeById использует только get_recipe_full (ingredients из ingredients_json); отдельный select recipe_ingredients убран. Share flow передаёт p_locale в get_recipe_by_share_ref.
- **translate-recipe (Edge):** переводит title, description, chef_advice + все steps.instruction + все ingredients name/display_text; пишет recipe_translations, recipe_step_translations, recipe_ingredient_translations. Skip по has_recipe_full_locale_pack; при выключенном `ENABLE_RECIPE_TRANSLATION` или пустом target_locale возвращает skipped. Failure-safe: сбой перевода не ломает save; ответ 200 с status created/skipped/error и опционально translated_steps_count, translated_ingredients_count.
- **Fallback:** при отсутствии переводов шаги и ингредиенты берутся из recipe_steps и recipe_ingredients; контракт RecipePage не ломается.
- **Feature-gated:** для RU-only rollout автоматический перевод отключён (см. Auto-translation feature flag выше).

### ML-7 checklist

- [x] recipe_step_translations added
- [x] recipe_ingredient_translations added
- [x] upsert/check RPC added (upsert_recipe_step_translation, upsert_recipe_ingredient_translation, has_recipe_steps_translation, has_recipe_ingredients_translation, has_recipe_full_locale_pack)
- [x] get_recipe_full returns localized steps
- [x] get_recipe_full returns localized ingredients (ingredients_json)
- [x] translate-recipe writes steps translations
- [x] translate-recipe writes ingredient translations
- [x] fallback preserved for untranslated recipes
- [x] ML-6 deferred documented

### Translation activation (RU rollout vs future EN)

**Current state (RU rollout):**
- Translation pipeline fully implemented (ML-7), but disabled via feature flags
- No automatic translation is performed
- No token usage for translation
- Client may still pass `target_locale`, but it does not trigger translation

**Safe default behavior:**
- Absence of `VITE_ENABLE_RECIPE_TRANSLATION` → frontend translation OFF
- Absence of `ENABLE_RECIPE_TRANSLATION` → backend translation OFF
- Translation is executed ONLY if flag value === `"true"`
- Any other value (undefined / false) = OFF

**Important:**
- There is NO default fallback like `target_locale = 'en'`
- Empty or missing `target_locale` results in `skipped`
- Same-locale translation (e.g. ru → ru) results in `skipped`

### How to enable translation in the future (EN rollout)

To enable automatic translation:

1. **Enable backend flag:** `ENABLE_RECIPE_TRANSLATION=true` (Supabase Edge Secrets)
2. **(Optional) Enable frontend trigger:** `VITE_ENABLE_RECIPE_TRANSLATION=true`
3. **Ensure client sends target locale:** `target_locale = getAppLocale()` (e.g. `'en'`)
4. **Translation will run only if:**
   - feature flag is enabled
   - target_locale is non-empty
   - target_locale differs from source recipe locale

**Notes:**
- No translation happens without explicit target_locale
- No translation happens if flags are not enabled
- Old recipes remain untranslated (ML-6 deferred)

### Future note: ML-6 backfill (когда будем делать)

**Сейчас НЕ запускать** массовый перевод старых рецептов автоматически.

**Будущая стратегия ML-6:**
1. Сначала cleanup/модерация старой базы.
2. Исключить blocked, слабые и кривые рецепты.
3. Переводить батчами только приоритетные: trusted, высокий score, часто в планах/избранном.
4. Сначала одна целевая локаль (например `en`).
5. Batch process должен быть idempotent и cost-aware. После ML-7 можно включать и steps/ingredients.

Реализацию backfill не делать в текущей задаче.

## Open questions (Stage 1)
- **Индекс по trust_level:** на Stage 1 не добавлен. Выборка пула фильтрует по source (существующий idx_recipes_pool_user_created) и по trust_level в приложении; при росте объёма можно добавить частичный индекс WHERE source IN (...) AND (trust_level IS NULL OR trust_level <> 'blocked').
- **source_lang в deepseek-chat:** передаётся null — надёжного источника языка запроса на Stage 1 нет; при появлении заголовка/контекста локали можно передавать его в source_lang.
- **user_custom в backfill:** для существующих рецептов с source = 'user_custom' выставлен trust_level = 'trusted' (рецепт пользователя).
