# Little Bites AI — схема базы данных

Документ для контекста ИИ: описание структуры БД проекта **Little Bites AI** (приложение для детского питания, рецепты, планы питания, подписки).

**Репозиторий:** https://github.com/aiappsprobusiness-collab/little-bites-ai

**СУБД:** Supabase (PostgreSQL). Миграции в `supabase/migrations/`.

## Schema consistency note

This documentation reflects the actual production schema.  
If a table is not present in `information_schema`, it must **not** be described here as an active table. Removed tables are listed only under [Legacy / Removed tables](#legacy--removed-tables).

---

## Оглавление

1. [Пользователи и подписки](#пользователи-и-подписки)
2. [Члены семьи (профили)](#члены-семьи-профили)
3. [Рецепты и ингредиенты](#рецепты-и-ингредиенты)
4. [Избранное и планы питания](#избранное-и-планы-питания)
5. [Чат и логи](#чат-и-логи)
6. [Контент и платежи](#контент-и-платежи)
7. [Перечисления (enum)](#перечисления-enum)

---

## Пользователи и подписки

### `public.profiles_v2`

Профиль пользователя: подписка, лимиты, триал, email (копия из Auth).

| Колонка          | Тип                    | Описание |
|------------------|------------------------|----------|
| id               | uuid PK                | |
| user_id          | uuid NOT NULL → auth.users | Уникален (UNIQUE) |
| status           | profile_status_v2      | free \| premium \| trial |
| daily_limit      | integer (1–100)        | 5 (free) / 30 (premium/trial) |
| last_reset       | timestamptz            | Для сброса счётчика за день |
| premium_until     | timestamptz            | Окончание премиума/триала |
| requests_today    | integer DEFAULT 0      | Легаси-счётчик; **дневные лимиты чата** в приложении считаются по `usage_events` (`chat_recipe` / `help`), см. `get_usage_count_today`. |
| email            | text                   | Копия auth.users.email |
| trial_started_at | timestamptz            | Когда активирован триал (по кнопке) |
| trial_until      | timestamptz            | Окончание триала (3 дня) |
| trial_used       | boolean DEFAULT false  | Триал уже был использован (повторно нельзя) |
| plan_initialized  | boolean DEFAULT false | true после первого автозаполнения дня в Plan |
| active_session_key | text                   | Ключ единственной активной сессии; при новом логине обновляется, старые устройства при проверке разлогиниваются |
| accepted_terms_at | timestamptz            | Когда при регистрации зафиксировано согласие с соглашением и политикой (серверное время); nullable |
| accepted_terms_version | text            | Версия юртекстов на момент согласия (`LEGAL_TERMS_VERSION` из приложения); nullable |
| last_active_member_id | uuid NULL → members | Последний выбранный член семьи в UI (Premium/Trial); `NULL` = семейный режим или «не задано». При удалении member — `ON DELETE SET NULL`. Триггер гарантирует, что `members.user_id` совпадает с `profiles_v2.user_id`. Клиент: `FamilyContext`, `lastActiveMemberProfile.ts`. |
| show_input_hints | boolean NOT NULL DEFAULT true | Ротирующиеся подсказки в поле ввода чата рецептов; при `false` — статичный плейсхолдер. Клиент: `useSubscription`, `ChatPage`, `ProfilePage`. |
| theme | text NOT NULL DEFAULT `light` | Тема UI: `light` \| `dark` (CHECK). Клиент: `next-themes` + `profiles_v2` + `ProfilePage`. |

RLS: доступ только по `auth.uid() = user_id`. Запись при регистрации — триггер `handle_new_user_v2` на `auth.users`. Поля `accepted_terms_*` заполняются из `raw_user_meta_data.accepted_terms_version` при `signUp`, если клиент передал версию (см. миграцию `20260329190000_profiles_v2_accepted_terms.sql`, `docs/dev/legal-copy-and-auth-consent.md`).

---

### `public.subscriptions`

Платежи подписки (Т-Банк эквайринг). Edge `payment-webhook` при `Status=CONFIRMED` и валидной подписи вызывает `confirm_subscription_webhook` только если сумма уведомления **в точности** совпадает с ценой тарифа из `subscriptions.plan` (копейки: месяц 29900, год 199900; источник цен — `_shared/subscriptionPricing.json`, как в `create-payment`). Иначе Premium не выдаётся (лог `grant_denied`). Подробнее: `docs/dev/PAYMENT_WEBHOOK_PREMIUM_VALIDATION.md`.

| Колонка   | Тип     | Описание |
|-----------|---------|----------|
| id        | uuid PK | |
| user_id   | uuid → auth.users | |
| plan      | text    | 'month' \| 'year' |
| status    | text    | 'pending' \| 'confirmed' \| 'cancelled' |
| started_at| timestamptz | |
| expires_at| timestamptz | |
| payment_id| bigint  | От Тинькофф |
| order_id  | text UNIQUE NOT NULL | |
| created_at| timestamptz | |

RLS: только `service_role`. Пользователь не имеет прямого доступа.

---

## Члены семьи (профили)

### `public.members`

Профили членов семьи (ребёнок/взрослый/семья): имя, возраст, аллергии, предпочтения.

| Колонка     | Тип              | Описание |
|-------------|------------------|----------|
| id          | uuid PK          | |
| user_id     | uuid → auth.users | |
| name        | text NOT NULL    | |
| type        | member_type_v2   | child \| adult \| family |
| age_months  | integer          | |
| allergies   | text[]           | Легаси; предпочтительно allergy_items |
| allergy_items | jsonb DEFAULT '[]' | [{ value, is_active, sort_order }]. Free: активна только первая. |
| likes       | text[]           | Premium/trial |
| dislikes    | text[]           | Premium/trial |
| introduced_product_keys | text[] NOT NULL DEFAULT '{}' | Нормализованные ключи уже введённых продуктов прикорма (<12 мес), soft-сигнал для client-side infant ranking. |
| introducing_product_key | text NULL | Активный продукт в текущем периоде введения (2–3 дня); вместе с `introducing_started_at`. |
| introducing_started_at | date NULL | Дата начала периода введения `introducing_product_key` (клиент пишет `YYYY-MM-DD` в локальной дате). |
| preferences | text[]           | Предпочтения в еде (например vegetarian, quick meals) |
| difficulty  | text             | Сложность рецептов: easy, medium, any |

RLS: по `auth.uid() = user_id`.

**Лимиты (триггер `members_enforce_subscription_limits_trigger`, `members_enforce_subscription_limits`):** доступ **paid** если выполняется любое из: `profiles_v2.premium_until > now()`, `profiles_v2.trial_until > now()`, есть строка `subscriptions` со `status = confirmed` и `expires_at > now()`, либо email в `profiles_v2` совпадает с внутренним списком безлимита (зеркало `UNLIMITED_ACCESS_EMAILS` в `useSubscription.tsx`). Тогда: не более **7** строк `members` на пользователя, не более **7** активных аллергий, **5** likes и **5** dislikes на строку; иначе (free): не более **1** профиля и **1** активной аллергии. Дублирует продуктовые лимиты из `src/utils/subscriptionRules.ts`.

---

## Рецепты и ингредиенты

### `public.recipes`

Рецепты: от чата/недели/сида/ручные/пользовательские. Связаны с `user_id` и опционально с `member_id` (child_id — легаси).

| Колонка             | Тип                    | Описание |
|---------------------|------------------------|----------|
| id                  | uuid PK                | |
| user_id             | uuid → auth.users      | Владелец (пул рецептов) |
| child_id            | uuid → members         | Легаси, дублирует member_id |
| member_id           | uuid → members         | Для кого рецепт (опционально) |
| title               | text NOT NULL          | |
| norm_title          | text                   | Нормализованный заголовок: `lower(btrim(title))`, триггер `recipes_set_norm_title`. Используется для дедупликации curated seed при импорте. |
| description         | text                   | **Канонический короткий текст для карточек и API.** Для **`source = chat_ai`** (пайплайн Edge `deepseek-chat`): **LLM-first** — после `sanitizeRecipeText` / `sanitizeMealMentions` вызывается **`resolveChatRecipeCanonicalDescription`**: при прохождении **`passesDescriptionQualityGate`** (1–2 предложения, **38–210** симв., маркер **нутритивный или сенсорный** — `hasNutritionalOrSensoryDescriptionCue`, без штампов/leak и без `textContainsRequestContextLeak`; при **≥4** «сильных» токенах в title — привязка к блюду, см. `descriptionPassesTitleAnchoringHeuristic` / `missing_title_anchoring`; отдельная причина отказа — `missing_nutritional_or_sensory_cue`) источник **`llm_raw`**; иначе один вызов **`repairChatRecipeDescription`** (только поле description); при успехе гейта — **`llm_repair`**; иначе **`buildEmergencyChatRecipeDescription`** (**`emergency_fallback`**). Логи с тегами **`DESCRIPTION_PIPELINE_*`**. **`buildRecipeBenefitDescription`** для финального текста **`chat_ai` на Edge не используется** (остаётся для UI/других источников). Строка в **`message` (JSON)** и **`recipes[0].description`** ответа совпадает с **`recipes.description`** в БД. Для **`week_ai` / starter / seed** и при клиентском `createRecipe` для не-`chat_ai` по-прежнему может задаваться benefit-builder. Заголовок блока пользы в UI (`getBenefitLabel`) задаётся отдельно там, где блок показывается; **в превью слотов вкладки «План» (день) этот текст и подпись не выводятся** — только КБЖУ и чипсы целей (`nutrition_goals`). У **`manual` / `user_custom`** — произвольный текст из формы. **Экран рецепта (`RecipePage`):** абзац в блоке пользы — при непустом `description` после trim показывается он (данные из `get_recipe_full`, с учётом локали и `recipe_translations`); иначе — `buildRecipeBenefitDescription`. |
| image_url           | text                   | |
| cooking_time_minutes| integer                | |
| cooking_time        | integer                | Дубликат в минутах |
| min_age_months      | integer DEFAULT 6      | |
| max_age_months      | integer DEFAULT 36     | |
| calories, proteins, fats, carbs | numeric | |
| is_favorite         | boolean DEFAULT false  | |
| rating              | integer 1–5            | |
| times_cooked        | integer DEFAULT 0      | |
| tags                | text[]                 | |
| source_products     | text[]                 | |
| source              | text                   | chat_ai \| week_ai \| starter \| seed \| manual \| user_custom |
| meal_type           | text                   | breakfast \| lunch \| snack \| dinner (только эти четыре; `create_user_recipe` / `update_user_recipe` не сохраняют `other` и прочие значения — в NULL) |
| nutrition_goals     | jsonb NOT NULL DEFAULT '[]' | Goals для UI/плана: ключи balanced, iron_support, brain_development, weight_gain, gentle_digestion, energy_boost (CHECK whitelist). В curated-сидах допускаются алиасы (напр. energy, satiety) — в JSON для импорта их приводит `normalizeNutritionGoalsForDb` в `scripts/toddler-seed/nutritionGoalsDb.mjs`; на клиенте нормализация — `normalizeNutritionGoals` в `src/utils/nutritionGoals.ts`. Подписи в UI: `GOAL_LABELS`. |
| steps               | jsonb DEFAULT '[]'     | Шаги (альтернатива recipe_steps) |
| chef_advice         | text                   | Совет шефа (LLM + quality gate в deepseek-chat, first-pass; **без** второго полного LLM-вызова рецепта при отклонении совета); может быть NULL. Для `user_custom` опционально. |
| advice              | text                   | Альтернативный короткий совет; может быть NULL. Для `chat_ai` / `week_ai` / `manual` триггер `recipes_validate_not_empty` требует только непустой `description`, не требует ни `chef_advice`, ни `advice`. |
| generation_context  | jsonb                  | Контекст генерации |
| allergens           | text[]                 | |
| owner_user_id       | uuid → auth.users      | Владелец user_custom; NULL для остальных |
| visibility          | text                   | public \| private (для user_custom) |
| servings_base       | integer NOT NULL DEFAULT 1 | Базовое число порций; количества в БД приведены к этому значению (легаси 5, новые 1). |
| servings_recommended| integer NOT NULL DEFAULT 4 | Рекомендуемое число порций для UX и масштаба ингредиентов на карточке (обед/ужин могут быть 2–3 и т.д.; дефолт **4** после миграции `20260406150100_recipes_servings_recommended_default_4.sql`). |
| is_soup             | boolean NOT NULL DEFAULT false | Признак супа; для правила «слот обед = только супы». assign_recipe_to_plan_slot не меняет это поле. |
| locale              | text NOT NULL DEFAULT 'ru' | Язык контента строки (ru, en, es). Для мультиязычности. |
| source_lang         | text                | Язык, на котором сгенерирован контент (для AI/manual). |
| trust_level         | text                | Уровень доверия пула: **core** (curated каталог, `source = seed`), **seed**/**starter** (legacy метки tier), **trusted** (поведенчески из candidate или `manual`), **candidate** (chat_ai/week_ai), **blocked**. CHECK: перечисленные значения или NULL. Пул (generate-plan) исключает blocked. См. миграцию `20260329100000_recipe_trust_level_core.sql`. |
| cuisine             | text NULL           | Stage 4.4: грубая метка кухни (строка/slug); **не** выводится из `locale`. Задел под soft ranking общего пула (см. Stage 4.4 в docs/refactor). |
| region              | text NULL           | Stage 4.4: опциональный региональный/школьный hint; без нормализованной таксономии на MVP. |
| familiarity         | text NULL           | Stage 4.4: `classic` \| `adapted` \| `specific` — «широта» культурной узнаваемости для будущего ранжирования в generate-plan. CHECK при NOT NULL. При создании через `create_recipe_with_steps`, если не передано — выставляется `infer_cultural_familiarity(cuisine)` (эвристика, без LLM). |
| score               | float DEFAULT 0      | Скор: +2×likes −2×dislikes +1×added_to_plan −0.5×replaced_in_plan −0.5×removed_from_plan **+1.5×shared +4×signup_from_share** (см. `20260406150000_recipe_feedback_share_signup_score.sql`). Пересчёт триггером при INSERT/DELETE в recipe_feedback; clamp [-10, 50]. |
| created_at, updated_at | timestamptz         | |

RLS: SELECT — публичные или свои (или private + owner). INSERT/UPDATE/DELETE — владелец по user_id или owner_user_id для user_custom.

**Индекс для seed-каталога (идемпотентный импорт):** частичный уникальный индекс `recipes_seed_catalog_identity_v2` на `(user_id, locale, norm_title, min_age_months, max_age_months, meal_type)` при `source = 'seed'`, `norm_title IS NOT NULL`, `meal_type IS NOT NULL` — см. миграции `20260325130000_recipes_seed_catalog_unique.sql` (v1, заменён) и `20260328120000_recipes_seed_catalog_identity_meal_type.sql` (v2), скрипт `scripts/import-infant-seed.ts` (tsx, infant + toddler каталоги, опционально `--file=...`; см. `package.json` `seed:*:import`).

---

### `public.recipe_ingredients`

Ингредиенты рецепта. Категория — product_category (vegetables, fruits, dairy, meat, grains, other).

**Слои данных (dual measurement, миграция `20260404120000_recipe_ingredients_dual_measurement.sql`):**

- **Канонический слой (source of truth для математики):** `canonical_amount`, `canonical_unit`. Пересчёт порций, агрегирование, список покупок опираются на них, а не на `display_text`. В RPC `create_recipe_with_steps` / `ingredient_canonical` допустимы нормализованные единицы **`g`, `ml`, `pcs`, `tsp`, `tbsp`** (вход **`kg`/`l`** приводятся к `g`/`ml`). Исторические seed-строки могли быть без канона — отдельный этап: `scripts/backfill-recipe-ingredient-canonical.ts` + `shared/ingredientCanonicalBackfill.ts` (см. `docs/dev/RECIPE_INGREDIENT_DUAL_MEASUREMENT.md`).
- **UX / display-слой:** `display_amount`, `display_unit`, `display_quantity_text`, `measurement_mode` (`canonical_only` \| `dual` \| `display_only`), плюс `display_text` как fallback и для совместимости с переводами (ML-7). В режиме `dual` строка вида «Лук — 1 шт. = 80 г» собирается через `shared/ingredientMeasurementDisplay.ts` (`formatIngredientMeasurement`); выбор `dual` vs `canonical_only` при сохранении — `enrichIngredientMeasurementForSave` + `shared/ingredientMeasurementEngine.ts` + quality gate (`shared/ingredientMeasurementQuality.ts`). Осторожный backfill dual-слоя — `scripts/backfill-recipe-ingredient-dual-display.ts` + `shared/ingredientDualBackfill.ts` (те же правила, что save-time; требует валидного канона там, где dual опирается на граммы/мл). Для **всего пула** рецептов (source: seed, starter, manual, week_ai, chat_ai): `npm run backfill:ingredient-dual -- --pool`. Подробнее: `docs/dev/RECIPE_INGREDIENT_DUAL_MEASUREMENT.md`.

| Колонка          | Тип                 | Описание |
|------------------|---------------------|----------|
| id               | uuid PK             | |
| recipe_id        | uuid → recipes      | |
| name             | text NOT NULL       | |
| amount           | decimal             | |
| unit             | text                | |
| display_text     | text                | Fallback: «морковь — 100 г» или полная dual-строка при сохранении из пайплайна |
| canonical_amount | numeric             | В граммах/мл (g/ml) |
| canonical_unit   | text                | после нормализации в RPC: **`g` \| `ml` \| `pcs` \| `tsp` \| `tbsp`** (см. `normalize_ingredient_unit`, `ingredient_canonical` в миграции `20260220120000_...` и логику `create_recipe_with_steps`) |
| category         | product_category    | vegetables, fruits, dairy, meat, grains, other, **fish**, **fats**, **spices** (enum); в UI списка покупок fish → секция meat, fats/spices → other. При сохранении через `create_recipe_with_steps`, если категория в payload пустая или `other`, записывается результат `infer_ingredient_category` по объединённым полям name и display_text (русские эвристики). |
| order_index      | integer DEFAULT 0   | |
| substitute       | text                | Замена (Premium Smart Swap) |
| display_amount   | numeric NULL        | Бытовое количество (напр. зубчики, ст. л., шт.) |
| display_unit     | text NULL           | Бытовая единица |
| display_quantity_text | text NULL    | Нерегулярная подпись («1 небольшой кочан») |
| measurement_mode | text NOT NULL DEFAULT `canonical_only` | `canonical_only` \| `dual` \| `display_only` (CHECK) |

RLS: через родительский recipe (user_id или owner).

---

### `public.recipe_steps`

Шаги приготовления.

| Колонка       | Тип            | Описание |
|---------------|----------------|----------|
| id            | uuid PK        | |
| recipe_id     | uuid → recipes | |
| step_number   | integer NOT NULL | |
| instruction   | text NOT NULL  | |
| duration_minutes | integer     | |
| image_url     | text           | |

RLS: через recipe.

---

### `public.recipe_feedback`

События качества рецепта (лайки, план, шаринг, атрибуция регистрации). История без upsert для план-событий; **shared** и **signup_from_share** — не более одной строки на пару (recipe_id, user_id) (частичные уникальные индексы).

| Колонка   | Тип        | Описание |
|-----------|------------|----------|
| id        | uuid PK    | |
| recipe_id | uuid → recipes NOT NULL | |
| user_id   | uuid → auth.users NOT NULL | |
| action    | text NOT NULL | like, dislike, added_to_plan, removed_from_plan, replaced_in_plan, **shared**, **signup_from_share** (CHECK) |
| created_at| timestamptz NOT NULL DEFAULT now() | |

После вставки триггер пересчитывает recipes.score и при необходимости trust_level (candidate → trusted/blocked). RLS: INSERT/SELECT только свой user_id.

---

### `public.recipe_translations` (Stage 3)

Переводы полей рецепта по локали: title, description, chef_advice. Чтение только через RPC get_recipe_previews / get_recipe_full с параметром p_locale; при отсутствии перевода используется содержимое из recipes.

| Колонка             | Тип                    | Описание |
|---------------------|------------------------|----------|
| id                  | uuid PK                | |
| recipe_id           | uuid NOT NULL → recipes(id) ON DELETE CASCADE | |
| locale              | text NOT NULL          | ru, en, es и т.д. |
| title               | text                   | |
| description         | text                   | |
| chef_advice         | text                   | |
| translation_status  | text NOT NULL DEFAULT 'draft' | draft, auto_generated, reviewed (CHECK) |
| source              | text NOT NULL DEFAULT 'manual' | manual, ai, imported (CHECK) |
| created_at, updated_at | timestamptz NOT NULL | |

UNIQUE(recipe_id, locale). Индекс по (recipe_id, locale). Триггер updated_at. RLS включён; прямого SELECT для anon/authenticated нет — доступ только через SECURITY DEFINER RPC.

---

### `public.recipe_step_translations` (ML-7)

Переводы шагов рецепта по локали: только **instruction**. Нумерация шагов (**step_number**) не хранится здесь — каноническое поле в **recipe_steps**. Read flow (get_recipe_full, get_recipe_by_share_ref) берёт step_number и порядок из recipe_steps; из recipe_step_translations подставляется только instruction с fallback на recipe_steps.instruction.

| Колонка             | Тип                    | Описание |
|---------------------|------------------------|----------|
| id                  | uuid PK                | |
| recipe_step_id      | uuid NOT NULL → recipe_steps(id) ON DELETE CASCADE | |
| locale              | text NOT NULL          | ru, en, es и т.д. |
| instruction         | text                   | |
| translation_status  | text NOT NULL DEFAULT 'draft' | draft, auto_generated, reviewed (CHECK) |
| source              | text NOT NULL DEFAULT 'manual' | manual, ai, imported (CHECK) |
| created_at, updated_at | timestamptz NOT NULL | |

UNIQUE(recipe_step_id, locale). Индекс по (recipe_step_id, locale). Триггер updated_at. RLS включён; прямой SELECT для anon/authenticated не даётся — доступ только через SECURITY DEFINER RPC.

---

### `public.recipe_ingredient_translations` (ML-7)

Per-recipe overlay переводов ингредиентов по локали: name, display_text. Чтение только через RPC get_recipe_full (ingredients_json) и get_recipe_by_share_ref с p_locale; при отсутствии перевода используются recipe_ingredients.name и recipe_ingredients.display_text. Для локалей, отличных от базовой: минимально рискованный путь — переводить итоговую `display_text` (включая dual-строку), пока отдельный перевод `display_quantity_text` / бытовых единиц не введён.

| Колонка             | Тип                    | Описание |
|---------------------|------------------------|----------|
| id                  | uuid PK                | |
| recipe_ingredient_id| uuid NOT NULL → recipe_ingredients(id) ON DELETE CASCADE | |
| locale              | text NOT NULL          | ru, en, es и т.д. |
| name                | text                   | |
| display_text        | text                   | |
| translation_status  | text NOT NULL DEFAULT 'draft' | draft, auto_generated, reviewed (CHECK) |
| source              | text NOT NULL DEFAULT 'manual' | manual, ai, imported (CHECK) |
| created_at, updated_at | timestamptz NOT NULL | |

UNIQUE(recipe_ingredient_id, locale). Индекс по (recipe_ingredient_id, locale). Триггер updated_at. RLS включён; прямой SELECT для anon/authenticated не даётся — доступ только через SECURITY DEFINER RPC.

---

## Избранное и планы питания

### `public.favorites_v2`

Избранные рецепты. Лимиты: 5 (free) / 50 (premium) — в приложении.

| Колонка     | Тип              | Описание |
|-------------|------------------|----------|
| id          | uuid PK          | |
| user_id     | uuid → auth.users | |
| recipe_id   | uuid → recipes   | Ссылка на рецепт (NOT NULL после миграций) |
| recipe_data | jsonb            | Легаси/кэш данных рецепта |
| member_id   | uuid → members   | NULL = общее избранное; иначе — для члена семьи |
| created_at  | timestamptz      | |

Уникальность: одно (user_id, recipe_id) для family (member_id IS NULL); одно (user_id, recipe_id, member_id) для члена.

RLS: по user_id.

---

### `public.meal_plans_v2`

План питания на день: дата + слоты приёмов пищи в JSONB.

| Колонка     | Тип              | Описание |
|-------------|------------------|----------|
| id          | uuid PK          | |
| user_id     | uuid → auth.users | |
| member_id   | uuid → members   | Для кого день |
| planned_date| date NOT NULL    | |
| meals       | jsonb NOT NULL   | Структура по приёмам (breakfast, lunch, snack, dinner) |

RLS: по user_id.

---

## Legacy / Removed tables

Таблицы ниже **отсутствуют в production**; приложение и Edge используют только **`meal_plans_v2`**. В старых миграциях могут оставаться идемпотентные проверки `information_schema` для окружений, где таблица когда-то существовала.

| Таблица        | Статус |
|----------------|--------|
| `meal_plans`   | Удалена; заменена на `meal_plans_v2` (одна строка на день, слоты в JSONB `meals`). |

---

## Чат и логи

### `public.chat_history`

История чата с ИИ (рецепты, сообщения).

| Колонка      | Тип              | Описание |
|--------------|------------------|----------|
| id           | uuid PK          | |
| user_id      | uuid → auth.users | |
| child_id     | uuid             | Опционально (V2: можно привязать к members) |
| message      | text NOT NULL    | |
| response     | text             | |
| message_type | text             | text \| image \| recipe |
| recipe_id    | uuid → recipes   | Связь с рецептом, если есть |
| archived_at  | timestamptz      | Архивирование |
| meta         | jsonb            | Метаданные ответа: (1) follow-up после аллергии/dislikes — blocked, original_query, suggested_alternatives, intended_dish_hint; (2) redirect во вкладку «Помощь маме» — systemHintType, topicKey, topicTitle, topicShortTitle для восстановления карточки и навигации по теме после remount. |
| created_at   | timestamptz      | |

RLS: по user_id.

---

### `public.plate_logs`

История запросов «Анализ тарелки» (balance_check).

| Колонка          | Тип              | Описание |
|------------------|------------------|----------|
| id               | uuid PK          | |
| user_id          | uuid → auth.users | |
| member_id        | uuid → members   | |
| user_message     | text NOT NULL    | |
| assistant_message| text NOT NULL    | |
| created_at       | timestamptz      | |

RLS: по user_id.

---

### `public.token_usage_log`

Учёт токенов по типам действий (чат, план на неделю, «Мы рядом» и т.д.).

| Колонка       | Тип              | Описание |
|---------------|------------------|----------|
| id            | uuid PK          | |
| user_id       | uuid → auth.users | |
| action_type   | text NOT NULL    | chat_recipe, weekly_plan, sos_consultant, diet_plan, balance_check, chat, plan_replace, **recipe_translation** (ML-5: перевод рецепта через Edge translate-recipe), other |
| input_tokens   | integer DEFAULT 0 | |
| output_tokens | integer DEFAULT 0 | |
| total_tokens  | integer DEFAULT 0 | |
| created_at    | timestamptz      | |

---

### `public.usage_events`

События по фичам для лимитов Free (например 2/день на фичу). Сутки по UTC. Для аналитики допускаются анонимные события и любые значения `feature` (CHECK снят).

| Колонка   | Тип              | Описание |
|-----------|------------------|----------|
| id        | uuid PK          | |
| user_id   | uuid → auth.users | NULL для анонимных событий (landing, до регистрации) |
| member_id | uuid → members   | |
| feature   | text             | Лимиты: chat_recipe, plan_fill_day, help. Аналитика: любые (landing_view, share_* и т.д.) |
| anon_id   | text             | Анонимный id до авторизации (localStorage) |
| session_id| text             | |
| page      | text             | pathname |
| entry_point | text           | share_recipe, share_plan и т.д. |
| utm_source, utm_medium, utm_campaign, utm_content, utm_term | text | UTM-метки |
| properties | jsonb NOT NULL DEFAULT '{}' | Доп. данные: paywall_reason, recipe_id, share_ref и т.д. |
| created_at| timestamptz      | |

---

### Схема `analytics` (Stage 3, только VIEW)

Схема не хранит таблицы; предназначена для продуктовой аналитики поверх `public.usage_events`.

#### `analytics.usage_events_enriched`

VIEW: те же строки, что в `usage_events`, плюс производные поля. Миграции: `20260331180000_analytics_usage_events_enriched_view.sql`, затем **`20260401120000_analytics_usage_events_enriched_stage5.sql`** (Stage 5).

| Колонка | Описание |
|---------|----------|
| id | Как в `usage_events` |
| event_timestamp | `created_at` |
| event_date_utc | Дата (UTC) |
| feature_raw, canonical_feature | Значение `feature` |
| event_group | acquisition, auth, paywall, meal_plan, chat, share, … (CASE по taxonomy Stage 2) |
| event_type | view, click, outcome, server_quota, limit_ui, other |
| user_id, anon_id, session_id, member_id, page, entry_point | Как в базовой таблице |
| utm_* | Как в базовой таблице |
| properties, onboarding_json | jsonb и вложенный onboarding |
| prop_recipe_id, prop_share_ref, prop_plan_ref, prop_paywall_reason, prop_source, prop_cta_target, prop_plan_scope, prop_plan_source, prop_share_type, prop_entry_point | Из `properties` |
| onboarding_first_landing_path, onboarding_entry_point | Из `properties.onboarding` |
| is_authenticated | `user_id IS NOT NULL` |
| platform | `properties->>'platform'` (web / pwa / ios / android / unknown), Stage 5 |

`GRANT USAGE` на схему и `SELECT` на view — для `authenticated` и `service_role`. Полное описание воронок и gaps: [docs/analytics/product-metrics-layer.md](../analytics/product-metrics-layer.md).

---

### `public.plan_generation_jobs`

Фоновая генерация плана (день/неделя). Для прогресса в UI.

| Колонка       | Тип     | Описание |
|---------------|---------|----------|
| id            | uuid PK | |
| user_id       | uuid → auth.users | |
| member_id     | uuid → members | |
| type          | text    | day \| week |
| status        | text    | running \| done \| error |
| started_at    | timestamptz | |
| completed_at  | timestamptz | |
| progress_total, progress_done | int | |
| last_day_key  | text    | |
| error_text    | text    | |
| created_at, updated_at | timestamptz | |

---

## Контент и платежи

### `public.articles`

Статьи (контент в стиле Flo): по возрасту и премиум.

| Колонка         | Тип     | Описание |
|-----------------|---------|----------|
| id              | uuid PK | |
| title           | text NOT NULL | |
| content         | text    | |
| description     | text    | Краткое описание для карточки |
| category        | text    | weaning, safety, nutrition |
| cover_image_url | text    | |
| is_premium      | boolean DEFAULT false | |
| age_category    | text    | infant, toddler, school, adult |

RLS: SELECT — authenticated; запись — service_role.

---

### `public.shopping_lists` / `public.shopping_list_items`

Списки покупок. Items связаны с рецептом (recipe_id), есть recipe_title. Запись в список из меню — только по явному действию пользователя (снимок); в `shopping_lists.meta` хранятся last_synced_range, last_synced_member_id, last_synced_plan_signature, last_synced_at для сравнения с текущим планом без автоперезаписи (см. docs/architecture/shopping_list_product_model.md).

| shopping_lists | | |
|-----------------|---|---|
| id, user_id     | uuid | |
| name            | text DEFAULT 'Список покупок' | |
| is_active       | boolean | |
| meta            | jsonb | Состояние синхронизации с планом (last_synced_*, см. useShoppingList). |
| created_at, updated_at | timestamptz | |

| shopping_list_items | | |
|----------------------|---|---|
| id, shopping_list_id, recipe_id | uuid | |
| name, amount, unit   | text, decimal, text | |
| category             | product_category | |
| is_purchased         | boolean | |
| recipe_title         | text | |
| meta                 | jsonb | `source_recipes`, `merge_key`; опционально `source_contributions`, `aggregation_unit` (фильтр по рецептам); опционально `dual_display_amount_sum`, `dual_display_unit` (dual-ингредиенты: левая часть «шт./ч. л. ≈ г/мл»). См. `docs/architecture/shopping_list_aggregation.md`. |
| created_at           | timestamptz | |

---

### `public.subscription_plan_audit`

Аудит определения плана подписки (почему выбран month/year). Запись только при реальном подтверждении (не при idempotent replay). Без PII/секретов.

| Колонка          | Тип     | Описание |
|------------------|---------|----------|
| id               | uuid PK | |
| created_at       | timestamptz NOT NULL | |
| user_id          | uuid    | |
| subscription_id  | uuid    | |
| order_id         | text    | |
| payment_id       | text    | |
| tbank_status     | text    | |
| amount           | bigint  | |
| plan_detected    | text NOT NULL | 'month' \| 'year' (CHECK) |
| source_of_plan   | text NOT NULL | 'Data' \| 'OrderId' \| 'DB' \| 'Amount' (CHECK) |
| data_keys        | text[]  | |
| raw_order_id_hint| text    | |
| note             | text    | |

RLS: только `service_role`.

---

### `public.share_refs`

Короткие ссылки для шаринга рецептов: `/r/:shareRef` → рецепт. share_ref: 8–12 символов base62.

| Колонка    | Тип     | Описание |
|------------|---------|----------|
| id         | uuid PK | |
| share_ref  | text NOT NULL UNIQUE | |
| recipe_id  | uuid NOT NULL → recipes(id) ON DELETE CASCADE | |
| created_at | timestamptz NOT NULL | |

RLS: INSERT — authenticated; SELECT — anon, authenticated (редирект по ссылке без авторизации).

**RPC get_recipe_by_share_ref(p_share_ref)** — возвращает рецепт + ингредиенты + шаги по короткой ссылке для публичной страницы `/r/:shareRef`. SECURITY DEFINER, доступен anon.

---

### `public.shared_plans`

Шаринг плана дня: `/p/:ref`. payload — дата, приёмы пищи (названия, типы).

| Колонка    | Тип     | Описание |
|------------|---------|----------|
| id         | uuid PK | |
| ref        | text NOT NULL UNIQUE | Короткий id 8–10 символов |
| user_id    | uuid NOT NULL → auth.users ON DELETE CASCADE | |
| member_id  | uuid → members ON DELETE SET NULL | |
| payload    | jsonb NOT NULL DEFAULT '{}' | Дата, слоты (breakfast, lunch и т.д.) |
| created_at | timestamptz NOT NULL | |

RLS: INSERT — только свой user_id; SELECT — anon, authenticated (публичное по ref).

---

## Перечисления (enum)

- **profile_status_v2:** `free`, `premium`, `trial`
- **member_type_v2:** `child`, `adult`, `family`
- **product_category:** `vegetables`, `fruits`, `dairy`, `meat`, `grains`, `other`
- **meal_type:** `breakfast`, `lunch`, `dinner`, `snack`

---

## Важные RPC (кратко)

- **create_recipe_with_steps(payload)** — создание рецепта из чата/недели (рецепт + шаги + ингредиенты с нормализацией). В payload опционально: locale (по умолчанию 'ru'), source_lang, trust_level (по умолчанию по source: **seed → core**, starter → starter, manual → trusted, chat_ai/week_ai → candidate), nutrition_goals (string[]; если не передано — `[]`), **cuisine**, **region**, **familiarity** (если `familiarity` не передан — вычисляется `infer_cultural_familiarity(cuisine)` в БД; при отсутствии cuisine обычно `adapted`). **servings_recommended** в payload опционально; если не передан — в RPC подставляется **4** (см. миграцию `20260406150100_recipes_servings_recommended_default_4.sql`). В каждом элементе `ingredients[]` опционально: **display_amount**, **display_unit**, **display_quantity_text**, **measurement_mode**; при `dual` без `display_quantity_text` требуются `display_amount` и `display_unit` (иначе RPC понижает до `canonical_only`).
- **infer_cultural_familiarity(cuisine text)** — Stage 4.4.1: детерминированная эвристика `classic` \| `adapted` \| `specific` по slug кухни (списки в миграции; зеркало TS `inferCulturalFamiliarity`). Без LLM; `locale` не используется.
- **create_user_recipe** / **update_user_recipe** / **delete_user_recipe** — пользовательские рецепты (source = user_custom), chef_advice опционально. `p_meal_type` сохраняется только как один из четырёх слотов плана (`breakfast` \| `lunch` \| `snack` \| `dinner`); иначе NULL и теги без `user_custom_<meal>`. См. миграцию `20260323140000_user_recipe_meal_type_plan_slots_only.sql`.
- **assign_recipe_to_plan_slot** — добавление рецепта в слот плана (member, day_key, meal_type). Записывает recipe_feedback: added_to_plan для нового рецепта, replaced_in_plan для предыдущего в слоте (premium).
- **get_recipe_my_vote(p_recipe_id)** — текущий голос пользователя по рецепту: 'like', 'dislike' или NULL (для UI).
- **record_recipe_feedback(p_recipe_id, p_action)** — like/dislike: один голос на пользователя (повторный тот же — no-op; переключение — toggle). **shared** / **signup_from_share**: идемпотентно, не более одной записи на (recipe_id, user_id) для каждого action. План-события — история. Free: только like, dislike, added_to_plan. Триггер обновляет recipes.score и trust_level.
- **recompute_recipe_score_and_trust(p_recipe_id)** — пересчёт score (формула в описании колонки `recipes.score`, clamp [-10, 50]) и trust: для **trusted** и **core** только обновление score, без auto-block и без смены trust; candidate → trusted при score≥8, likes≥2, dislikes≤1; candidate → blocked при (dislikes≥4 или score≤−6) и total_votes≥3 (cold start: при <3 голосах не блокировать). Для starter/seed и прочих не-candidate — только score, trust не меняется. Ручной UPDATE trust_level допустим. Вызывается триггерами INSERT/DELETE на recipe_feedback.
- **get_recipe_previews(recipe_ids, p_locale text DEFAULT NULL)** — превью рецептов (в т.ч. is_favorite из favorites_v2, `nutrition_goals` jsonb с fallback `[]`). При переданном p_locale подставляются title/description из recipe_translations с fallback на recipes. **Доступ (SECURITY DEFINER):** свои рецепты (`user_id = auth.uid()`), `user_custom` с `owner_user_id = auth.uid()`, либо для любого авторизованного пользователя рецепты с `source IN ('seed', 'starter', 'manual', 'week_ai', 'chat_ai')` (пул / каталог).
- **get_recipe_full(p_recipe_id, p_locale text DEFAULT NULL)** — полный рецепт со шагами, ингредиентами и избранным. При p_locale: title, description, chef_advice из recipe_translations; steps_json и ingredients_json — из recipe_step_translations и recipe_ingredient_translations с fallback на recipe_steps и recipe_ingredients. Также возвращает `nutrition_goals` (jsonb). **steps_json:** объекты с полями id, step_number (всегда из recipe_steps), instruction (локализованный или fallback); порядок по step_number ASC. **ingredients_json:** name, display_text (локализованные), amount, unit, substitute, canonical_amount, canonical_unit, order_index, **category**, **display_amount**, **display_unit**, **display_quantity_text**, **measurement_mode**. **Доступ:** тот же, что у **get_recipe_previews** (включая пул для `auth.uid()`), чтобы экран рецепта совпадал с карточками плана.
- **upsert_recipe_translation(p_recipe_id, p_locale, p_title, p_description, p_chef_advice, p_translation_status, p_source)** — ML-5: запись/обновление перевода (title, description, chef_advice). SECURITY DEFINER; проверяет recipe.user_id = auth.uid(). Вызывается из Edge function translate-recipe после AI-перевода.
- **has_recipe_translation(p_recipe_id, p_locale)** — ML-5: true, если у рецепта есть запись в recipe_translations для локали (проверяет владельца).
- **upsert_recipe_step_translation(p_recipe_step_id, p_locale, p_instruction, p_translation_status, p_source)** — ML-7: запись/обновление перевода шага. SECURITY DEFINER; проверяет владельца рецепта. Вызывается из Edge translate-recipe.
- **upsert_recipe_ingredient_translation(p_recipe_ingredient_id, p_locale, p_name, p_display_text, p_translation_status, p_source)** — ML-7: запись/обновление перевода ингредиента. SECURITY DEFINER; проверяет владельца рецепта. Вызывается из Edge translate-recipe.
- **has_recipe_steps_translation(p_recipe_id, p_locale)** — ML-7: true, если у рецепта нет шагов или у всех шагов есть непустой перевод на локаль (проверяет владельца).
- **has_recipe_ingredients_translation(p_recipe_id, p_locale)** — ML-7: true, если у рецепта нет ингредиентов или у всех ингредиентов есть перевод (name или display_text) на локаль (проверяет владельца).
- **has_recipe_full_locale_pack(p_recipe_id, p_locale)** — ML-7: true, если есть recipe_translations и переводы всех steps и всех ingredients для локали (проверяет владельца). Используется Edge translate-recipe для skip при полном пакете.
- **get_recipe_by_share_ref(p_share_ref, p_locale text DEFAULT NULL)** — рецепт по короткой ссылке шаринга для публичной страницы (anon). Объект **recipe** — строка `recipes` в JSON (`to_jsonb(r)`), включая **`nutrition_goals`** и **`description`**; при непустом **p_locale** поверх накладываются **title**, **description**, **chef_advice** из **recipe_translations** с fallback на базовые поля. Объекты **ingredients** включают те же поля measurement/dual, что и **ingredients_json** в get_recipe_full.
- **get_usage_count_today(user_id, feature)** — количество использований фичи за текущие сутки (UTC).
- **get_token_usage_by_action** — сводка токенов по типу действия за период.
- **normalize_allergies_for_free(user_id)** — для Free оставить активной только одну аллергию в allergy_items.

---

*Документ собран по миграциям в `supabase/migrations/`. Актуальность — на момент последнего обновления репозитория.*
