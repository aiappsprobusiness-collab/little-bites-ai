# Little Bites AI — схема базы данных

Документ для контекста ИИ: описание структуры БД проекта **Little Bites AI** (приложение для детского питания, рецепты, планы питания, подписки).

**Репозиторий:** https://github.com/aiappsprobusiness-collab/little-bites-ai

**СУБД:** Supabase (PostgreSQL). Миграции в `supabase/migrations/`.

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
| requests_today    | integer DEFAULT 0      | Запросы за текущий день |
| email            | text                   | Копия auth.users.email |
| trial_started_at | timestamptz            | Когда активирован триал (по кнопке) |
| trial_until      | timestamptz            | Окончание триала (3 дня) |
| trial_used       | boolean DEFAULT false  | Триал уже был использован (повторно нельзя) |
| plan_initialized  | boolean DEFAULT false | true после первого автозаполнения дня в Plan |

RLS: доступ только по `auth.uid() = user_id`. Запись при регистрации — триггер `handle_new_user_v2` на `auth.users`.

---

### `public.subscriptions`

Платежи подписки (Т-Банк эквайринг). Webhook обновляет `status` и синхронизирует с `profiles_v2`.

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
| preferences | text[]           | Предпочтения в еде (например vegetarian, quick meals) |
| difficulty  | text             | Сложность рецептов: easy, medium, any |

RLS: по `auth.uid() = user_id`. Лимиты Free: 1 член семьи, 1 аллергия (в приложении).

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
| description         | text                   | |
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
| meal_type           | text                   | breakfast \| lunch \| snack \| dinner |
| steps               | jsonb DEFAULT '[]'     | Шаги (альтернатива recipe_steps) |
| chef_advice         | text                   | Совет шефа (опционально для user_custom) |
| advice              | text                   | |
| generation_context  | jsonb                  | Контекст генерации |
| allergens           | text[]                 | |
| owner_user_id       | uuid → auth.users      | Владелец user_custom; NULL для остальных |
| visibility          | text                   | public \| private (для user_custom) |
| servings_base       | integer NOT NULL DEFAULT 1 | Базовое число порций; количества в БД приведены к этому значению (легаси 5, новые 1). |
| servings_recommended| integer NOT NULL DEFAULT 1 | Рекомендуемое число порций для UX (напр. обед 3, ужин 2, иначе 1). |
| created_at, updated_at | timestamptz         | |

RLS: SELECT — публичные или свои (или private + owner). INSERT/UPDATE/DELETE — владелец по user_id или owner_user_id для user_custom.

---

### `public.recipe_ingredients`

Ингредиенты рецепта. Категория — product_category (vegetables, fruits, dairy, meat, grains, other).

| Колонка          | Тип                 | Описание |
|------------------|---------------------|----------|
| id               | uuid PK             | |
| recipe_id        | uuid → recipes      | |
| name             | text NOT NULL       | |
| amount           | decimal             | |
| unit             | text                | |
| display_text     | text                | Текст вида «морковь — 100 г» |
| canonical_amount | numeric             | В граммах/мл (g/ml) |
| canonical_unit   | text                | g \| ml (CHECK) |
| category         | product_category    | vegetables, fruits, dairy, meat, grains, other |
| order_index      | integer DEFAULT 0   | |
| substitute       | text                | Замена (Premium Smart Swap) |

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

### `public.meal_plans`

Классический план: одна строка = один слот (дата + meal_type + recipe_id). Используется вместе с meal_plans_v2.

| Колонка      | Тип              | Описание |
|--------------|------------------|----------|
| id           | uuid PK          | |
| user_id      | uuid → auth.users | |
| child_id     | uuid → members   | |
| recipe_id    | uuid → recipes   | |
| planned_date | date NOT NULL    | |
| meal_type    | meal_type        | breakfast, lunch, dinner, snack |
| is_completed | boolean DEFAULT false | |
| created_at, updated_at | timestamptz | |

RLS: по user_id.

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
| action_type   | text NOT NULL    | chat_recipe, weekly_plan, sos_consultant, diet_plan, balance_check, chat |
| input_tokens   | integer DEFAULT 0 | |
| output_tokens | integer DEFAULT 0 | |
| total_tokens  | integer DEFAULT 0 | |
| created_at    | timestamptz      | |

---

### `public.usage_events`

События по фичам для лимитов Free (например 2/день на фичу). Сутки по UTC.

| Колонка   | Тип              | Описание |
|-----------|------------------|----------|
| id        | uuid PK          | |
| user_id   | uuid → auth.users | |
| member_id | uuid → members   | |
| feature   | text             | chat_recipe \| plan_refresh \| plan_fill_day \| help |
| created_at| timestamptz      | |

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

Списки покупок. Items связаны с рецептом (recipe_id), есть recipe_title.

| shopping_lists | | |
|-----------------|---|---|
| id, user_id     | uuid | |
| name            | text DEFAULT 'Список покупок' | |
| is_active       | boolean | |
| created_at, updated_at | timestamptz | |

| shopping_list_items | | |
|----------------------|---|---|
| id, shopping_list_id, recipe_id | uuid | |
| name, amount, unit   | text, decimal, text | |
| category             | product_category | |
| is_purchased         | boolean | |
| recipe_title         | text | |
| created_at           | timestamptz | |

---

### `public.subscription_plan_audit`

Аудит изменений плана подписки (для отладки/аналитики).

---

## Перечисления (enum)

- **profile_status_v2:** `free`, `premium`, `trial`
- **member_type_v2:** `child`, `adult`, `family`
- **product_category:** `vegetables`, `fruits`, `dairy`, `meat`, `grains`, `other`
- **meal_type:** `breakfast`, `lunch`, `dinner`, `snack`

---

## Важные RPC (кратко)

- **create_recipe_with_steps** — создание рецепта из чата/недели (рецепт + шаги + ингредиенты с нормализацией).
- **create_user_recipe** / **update_user_recipe** / **delete_user_recipe** — пользовательские рецепты (source = user_custom), chef_advice опционально.
- **assign_recipe_to_plan_slot** — добавление рецепта в слот плана (member, day_key, meal_type).
- **get_recipe_previews(recipe_ids)** — превью рецептов (в т.ч. is_favorite из favorites_v2).
- **get_recipe_full(recipe_id)** — полный рецепт со шагами и избранным.
- **get_usage_count_today(user_id, feature)** — количество использований фичи за текущие сутки (UTC).
- **get_token_usage_by_action** — сводка токенов по типу действия за период.
- **normalize_allergies_for_free(user_id)** — для Free оставить активной только одну аллергию в allergy_items.

---

*Документ собран по миграциям в `supabase/migrations/`. Актуальность — на момент последнего обновления репозитория.*
