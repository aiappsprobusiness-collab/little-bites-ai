# Recipe Multilang Rollout — Roadmap (после Stage 3)

Roadmap следующих шагов мультиязычности, опирающийся на **реальное состояние проекта** после завершения Stage 3 (recipe_translations + locale-aware reads). Не переписывает старый план — синхронизирован с [recipe-core-multilang-progress.md](./recipe-core-multilang-progress.md) и текущей реализацией.

> **Нумерация стадий:** этот файл **не продолжает** нумерацию master stages из recipe-core-multilang-refactor-plan / recipe-core-multilang-progress. Здесь описан **отдельный multilang rollout track**. Стадии названы **ML-4 … ML-9**, чтобы не конфликтовать с master plan (где Stage 4 = nutrition_traits + goals, Stage 5 = plan page refactor и т.д.).

---

## A. Goal

**Мультиязычность в проекте** — возможность показывать контент рецептов и интерфейс на выбранном языке (ru / en / es и др.) без поломки текущих сценариев.

Разделение областей:

| Область | Описание |
|--------|----------|
| **Recipe content multilang** | title, description, chef_advice (и позже steps/ingredients) по локали; чтение с fallback; запись переводов. |
| **UI multilang (i18n)** | Тексты интерфейса: кнопки, заголовки, paywall, onboarding, план. |
| **Generation multilang** | Генерация рецепта сразу на целевом языке (deepseek-chat, generate-plan). |
| **Legacy / backfill** | Перевод существующей базы рецептов (batch, приоритизация). |

Цель roadmap — поэтапно довести эти области до рабочего состояния, не делая big rewrite и сохраняя fallback.

---

## B. Current state (after Stage 3 + ML-4 + ML-5)

Состояние системы **после завершения ML-5** (translations for new recipes). ML-5 реализован и **работает end-to-end**: новые рецепты после save при выполнении условий создают записи в recipe_translations.

| Элемент | Статус |
|--------|--------|
| **recipes.locale** | Есть. NOT NULL DEFAULT 'ru'; backfill выполнен. |
| **recipes.source_lang, trust_level** | Есть (Stage 1). |
| **recipe_translations** | Таблица есть. Поля: recipe_id, locale, title, description, chef_advice, translation_status, source, created_at, updated_at. UNIQUE(recipe_id, locale). RLS: чтение только через RPC; запись — через RPC upsert_recipe_translation (ML-5). |
| **RPC p_locale** | get_recipe_previews(recipe_ids, p_locale), get_recipe_full(p_recipe_id, p_locale). Опциональный p_locale, fallback на recipes.* при отсутствии перевода или пустом поле. |
| **Fallback** | Реализован: COALESCE(NULLIF(trim(rt.*), ''), r.*) в RPC. |
| **Client** | **ML-4:** getAppLocale() (fallback 'en'). Превью и полный рецепт с p_locale; getRecipeById → get_recipe_full(id, getAppLocale()) + recipe_ingredients + servings. **ML-5:** requestRecipeTranslation только из useRecipes.createRecipe onSuccess. В запросе к deepseek-chat передаётся target_locale (getAppLocale()) для backend trigger. |
| **Create/save flows** | **ML-5 работает по обоим путям.** (1) **Client-saved:** createRecipe onSuccess → requestRecipeTranslation(recipeId). (2) **Backend-saved:** deepseek-chat после create_recipe_with_steps вызывает translate-recipe (fire-and-forget) с recipe_id, target_locale, __user_jwt. Дубли исключены; Edge: has_recipe_translation → при отсутствии перевода DeepSeek + upsert_recipe_translation. **Токены перевода** тратятся только если target_locale ≠ recipes.locale и перевода ещё нет; при same-locale или при уже существующей записи — status `skipped`, LLM не вызывается. **Для работы:** задеплоенная translate-recipe и секрет DEEPSEEK_API_KEY (см. [recipe-core-multilang-progress.md](./recipe-core-multilang-progress.md) § ML-5 deploy). |
| **Steps / ingredients** | **Не локализованы.** recipe_steps.instruction, recipe_ingredients.name/display_text — один язык; таблиц переводов для них нет. |
| **RecipePage** | Полный рецепт загружается через getRecipeById → get_recipe_full(p_recipe_id, getAppLocale()) + отдельный запрос recipe_ingredients и servings_base/servings_recommended; контракт данных для UI сохранён. |
| **get_recipe_by_share_ref** | Без p_locale; при необходимости можно добавить позже. |

Итог: пользователь **видит переводы** для новых рецептов при совпадении locale (getAppLocale()); для старых рецептов переводы по-прежнему отсутствуют (стратегия backfill — см. Future note в [recipe-core-multilang-progress.md](./recipe-core-multilang-progress.md)). При отсутствии записи в recipe_translations отображается контент из recipes (fallback). Явной настройки языка в приложении пока нет — используется язык браузера.

---

## C. Multilang rollout stages

### ML-4 — Locale plumbing (client + app level)

**Goal:** Сделать locale реально используемым: один источник правды и передача в RPC по всем read-путям.

**Scope:**
- Единый источник locale: настройка в профиле / app store (например React context или store) с дефолтом 'ru'.
- Прокидывание locale в useRecipePreviewsByIds, useFavorites, useMyRecipes везде, где рендерятся карточки/превью.
- Подключение get_recipe_full с p_locale для экрана рецепта (например переключить RecipePage на RPC get_recipe_full с locale вместо прямого select, либо читать locale из контекста и передавать в существующий источник данных).
- Постепенное включение locale-aware reads: план (превью), избранное, мои рецепты, страница рецепта.

**Out of scope:**
- Создание/заполнение переводов (recipe_translations).
- Генерация на целевом языке.
- UI i18n (тексты кнопок, заголовков).

**Risks:** Неправильный приоритет источника locale (например системный язык vs явный выбор) может запутать; нужна ясная продуковая логика «язык приложения» vs «язык рецептов».

---

### ML-5 — Translations for new recipes (completed end-to-end)

**Goal:** Новые рецепты после сохранения получают запись в recipe_translations для целевых локалей (например en, es), чтобы пользователь с соответствующей локалью видел перевод.

**Реализовано и работает:** post-save перевод по обоим путям (client-saved и backend-saved); запись в recipe_translations через Edge translate-recipe + DeepSeek + RPC upsert_recipe_translation. Переводные токены тратятся только когда target_locale ≠ base locale и записи перевода ещё нет; при same-locale или при уже существующем переводе — skipped, LLM не вызывается.

**Scope (сделано):**
- Post-save шаг: после успешного create_recipe_with_steps (или после ответа deepseek-chat) вызов translate-recipe (Edge), запись в recipe_translations title/description/chef_advice.
- translation_status/source (auto_generated), идемпотентность по (recipe_id, locale), has_recipe_translation перед LLM.
- Failure-safe: сбой перевода не откатывает сохранение рецепта; рецепт уже в recipes, пользователь видит контент по fallback.

**Out of scope:**
- Обработка уже существующих (старых) рецептов (ML-6 backfill — см. future note в recipe-core-multilang-progress.md).
- Локализация steps/ingredients.

---

### ML-6 — Backfill existing recipes

**Goal:** Перевести существующую базу рецептов, чтобы пользователи с локалью en/es видели контент не только для новых рецептов.

**Future note:** Сейчас **не запускать** массовый перевод старых рецептов автоматически. Причины и будущая стратегия (cleanup, приоритизация, одна локаль en, idempotent cost-aware batch) — в [recipe-core-multilang-progress.md](./recipe-core-multilang-progress.md) § Future note: ML-6 backfill.

**Scope (когда будем делать):**
- Batch-процесс: выборка рецептов без перевода для целевой локали (или с draft/auto_generated для обновления).
- Приоритизация: например trusted / высокий score / часто в планах / недавно созданные; исключить blocked и слабые.
- Идемпотентность: повторный прогон не ломает уже заполненные recipe_translations (upsert по (recipe_id, locale) с осторожным обновлением).
- Операционно: скрипты/миграции или отдельный воркер; не блокировать основной save flow.

**Out of scope:**
- Локализация шагов и ингредиентов.
- Генерация на целевом языке.

**Risks:** Объём данных, стоимость перевода (если AI/внешний API), нагрузка на БД при массовой записи.

---

### ML-7 — Steps & ingredients localization

**Goal:** Полный перевод рецепта: не только title/description/chef_advice, но и шаги и названия ингредиентов.

**Scope:**
- **Steps:** Выбор стратегии — отдельная таблица recipe_step_translations (recipe_step_id, locale, instruction) или jsonb по локалям в recipe_steps; обновление get_recipe_full (и при необходимости get_recipe_previews) для подстановки steps по locale с fallback.
- **Ingredients:** Стратегия — ingredient_dictionary + ingredient_translations и/или overlay в recipe_translations (например jsonb с display_names по locale); отображение в RPC и UI с fallback на текущие name/display_text.

**Out of scope:**
- Менять контракт создания рецепта (steps/ingredients при создании остаются в одной локали); перевод — отдельный слой.

**Risks (критично):**
- Усложнение схемы и RPC; возможны дубли и рассинхрон.
- recipe_steps и recipe_ingredients используются во многих местах (план, избранное, шаринг); любой сбой fallback может сломать отображение.
- Рекомендуется: сначала зафиксировать стратегию в docs, потом точечные миграции и RPC, затем клиент.

---

### ML-8 — Locale-aware generation

**Goal:** Рецепты генерируются сразу на нужном языке (например пользователь выбрал en — запрос в чат и план возвращают контент на en).

**Scope:**
- Интеграция с deepseek-chat: передача целевой локали в запрос (из профиля/контекста); промпт и ожидаемый ответ на целевом языке; запись в recipes с locale = целевой язык (и при необходимости дублирование в recipe_translations для других локалей или наоборот).
- generate-plan: при подборе рецептов из пула учитывать locale (показывать переведённые title/description через существующие RPC); при создании week_ai рецепта — генерация на целевом языке.
- Связь locale ↔ generation: единый источник «язык генерации» (профиль/настройки).

**Out of scope:**
- UI i18n.
- Обязательный backfill старых рецептов под новую логику.

**Risks:** Качество генерации на неродном для модели языке; расхождение языка в чате и в сохранённом рецепте при смене настроек.

---

### ML-9 — UI i18n

**Goal:** Интерфейс приложения мультиязычный: подписи, кнопки, сообщения на выбранном языке.

**Scope:**
- Тексты UI: общие компоненты, навигация, форма рецепта, плана.
- Paywall, onboarding, план (MealPlanPage): подписи, CTA, сообщения об ошибках.
- Выбор языка в настройках и применение к UI (и при желании к recipe locale).

**Out of scope:**
- Контент рецептов (это ML-4–ML-7).
- Генерация на целевом языке (ML-8).

**Risks:** Полнота покрытия строк; согласованность ключей и fallback (например всегда ru при отсутствии перевода).

---

## D. Сводка по стадиям (Goal, Scope, Out of scope, Risks)

| Stage | Goal | Scope | Out of scope | Risks |
|-------|------|--------|--------------|--------|
| **ML-4** | Locale реально используется | Единый источник locale; передача в RPC; подключение get_recipe_full с p_locale на RecipePage и превью | Переводы, генерация | Приоритет источника locale |
| **ML-5** | Новые рецепты с переводами | Post-save перевод → recipe_translations; failure-safe | Старые рецепты, steps/ingredients | Задержка, канал перевода |
| **ML-6** | Перевести существующую базу | Batch, приоритизация, идемпотентность | Steps/ingredients, генерация | Объём, стоимость, нагрузка |
| **ML-7** | Полный перевод рецепта | Steps + ingredients по локали; стратегия таблиц/overlay | Изменение контракта создания | Сложность схемы, fallback, много точек использования |
| **ML-8** | Генерация на нужном языке | deepseek-chat + generate-plan + locale | UI i18n, backfill | Качество на неродном языке, рассинхрон |
| **ML-9** | UI мультиязычный | Тексты UI, paywall, onboarding, план | Контент рецептов, генерация | Покрытие строк, fallback |

---

## E. Recommended order (реальный, после Stage 3)

- **Сразу после Stage 3** логично делать **ML-4 (Locale plumbing)**. Без единого источника locale и передачи его в RPC пользователь не увидит даже уже существующие переводы (когда они появятся). Этап безопасен: только чтение с p_locale, fallback сохранён.

- **Быстрый эффект:** ML-4 даёт «подводку» под переводы; затем ML-5 — пользователь начнёт видеть переводы для **новых** рецептов. Пара ML-4 → ML-5 даёт минимальный жизнеспособный сценарий: выбор языка + переводы новых рецептов.

- **Безопасно:** ML-4 и ML-5 не трогают create_recipe_with_steps по контракту; отказ перевода не ломает save. ML-6 (backfill) — отдельный процесс, можно запускать после ML-5.

- **Рискованно:** ML-7 (steps/ingredients) — много точек использования, сложная схема; делать после стабилизации ML-4–ML-6. ML-8 (generation) зависит от качества модели по языкам. ML-9 (UI i18n) можно вести параллельно с ML-4–ML-5 при наличии ресурсов.

**Рекомендуемый порядок:** ML-4 → ML-5 → ML-6 → (ML-7 или ML-8 по приоритету продукта) → ML-9, с возможностью параллелить ML-6 и ML-8 или ML-9.

---

## F. Когда пользователь увидит мультиязычность

| Вопрос | Ответ |
|--------|--------|
| **После какого stage пользователь начнёт видеть переводы?** | После **ML-4** (locale в UI и передача в RPC) + появления записей в recipe_translations. Если переводы уже есть (ручной ввод, ML-5 для новых) — сразу после ML-4. Если переводов нет — пользователь увидит тот же контент из recipes (fallback). |
| **Когда новые рецепты будут на нужном языке?** | После **ML-5**: post-save перевод и запись в recipe_translations для выбранных локалей. Либо после **ML-8**, если «нужный язык» = генерация сразу на целевом языке (тогда новые рецепты создаются уже на en/es и т.д.). |
| **Когда UI станет мультиязычным?** | После **ML-9** (UI i18n): подписи, кнопки, paywall, onboarding, план на выбранном языке. |

Кратко: **переводы на экране** — после ML-4 (и наличия данных в recipe_translations). **Новые рецепты с переводами** — ML-5 (или ML-8 для генерации на языке). **Интерфейс на языке** — ML-9.

---

## G. Архитектурные принципы (критично)

- **recipes = canonical layer.** Основной контент (title, description, chef_advice и т.д.) хранится в recipes; это дефолтная локаль и источник правды при отсутствии перевода.

- **recipe_translations = overlay.** Дополнительный слой по (recipe_id, locale). Чтение всегда с fallback: нет записи или пустое поле → берём из recipes.

- **Fallback обязателен.** RPC и клиент не должны показывать пусто/ошибку, если перевода нет; только подстановка из recipes.

- **Translation failure не ломает save.** Создание/обновление рецепта не зависит от успеха записи в recipe_translations. Постобработка перевода — отдельный, отказоустойчивый шаг.

- **Rollout incremental.** По одному этапу; без big rewrite; обратная совместимость вызовов без p_locale и без записей в recipe_translations.

- **No big rewrite.** Мультиязычность добавляется поверх текущей архитектуры (RPC, хуки, таблицы), а не заменой всего стека.

---

*Документ создан после завершения Stage 3. Актуальное состояние реализации — в [recipe-core-multilang-progress.md](./recipe-core-multilang-progress.md).*
