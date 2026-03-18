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

## B. Current state (after Stage 3 + ML-4 + ML-5 + ML-7)

Состояние системы **после завершения ML-7** (steps + ingredients localization). ML-5 и ML-7 реализованы; **ML-6 backfill отложен**.

| Элемент | Статус |
|--------|--------|
| **recipes.locale** | Есть. NOT NULL DEFAULT 'ru'; backfill выполнен. |
| **recipes.source_lang, trust_level** | Есть (Stage 1). |
| **recipe_translations** | Таблица есть. Поля: recipe_id, locale, title, description, chef_advice, translation_status, source, created_at, updated_at. UNIQUE(recipe_id, locale). RLS: чтение только через RPC; запись — через RPC upsert_recipe_translation (ML-5). |
| **recipe_step_translations** | **ML-7.** Таблица: recipe_step_id, locale, instruction, translation_status, source. RLS без прямого SELECT; доступ через SECURITY DEFINER RPC. |
| **recipe_ingredient_translations** | **ML-7.** Таблица: recipe_ingredient_id, locale, name, display_text, translation_status, source. RLS без прямого SELECT; доступ через SECURITY DEFINER RPC. |
| **RPC p_locale** | get_recipe_previews(recipe_ids, p_locale), get_recipe_full(p_recipe_id, p_locale) с локализованными steps_json и ingredients_json; get_recipe_by_share_ref(p_share_ref, p_locale). Fallback на базовые таблицы при отсутствии перевода. |
| **Fallback** | Реализован везде: recipe_translations, recipe_step_translations, recipe_ingredient_translations. |
| **Client** | **ML-4:** getAppLocale(). Превью и полный рецепт с p_locale. **ML-7:** getRecipeById → только get_recipe_full (ingredients из ingredients_json) + servings. Share: get_recipe_by_share_ref с p_locale. **ML-5:** requestRecipeTranslation из createRecipe onSuccess только при VITE_ENABLE_RECIPE_TRANSLATION=true; target_locale в deepseek-chat. |
| **Create/save flows** | Без изменений. Перевод **feature-gated:** при ENABLE_RECIPE_TRANSLATION=true и переданном target_locale вызывается translate-recipe (recipe + steps + ingredients); skip по has_recipe_full_locale_pack. Для **RU-only rollout** флаги не включают — авто-перевод отключён. |
| **Steps / ingredients** | **ML-7:** локализованы через recipe_step_translations и recipe_ingredient_translations; get_recipe_full возвращает steps_json и ingredients_json с fallback. |
| **RecipePage** | Полный рецепт через get_recipe_full(id, getAppLocale()) — steps и ingredients уже в ответе RPC; отдельный select servings. |
| **get_recipe_by_share_ref** | **ML-7:** добавлен опциональный p_locale; клиент передаёт getAppLocale(). |

**ML-6 deferred:** массовый backfill старых рецептов не входит в эту задачу. Старые рецепты без переводов отображаются с fallback на базовый язык. Batch translation позже допускается.

**Auto-translation для RU rollout отключён:** перевод после save включается только при явных флагах (VITE_ENABLE_RECIPE_TRANSLATION на фронте, ENABLE_RECIPE_TRANSLATION в Edge). Без них токены не тратятся; pipeline готов к включению при мультилокальном этапе.

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

**Реализовано и работает (при включённых флагах):** post-save перевод по обоим путям (client-saved и backend-saved); запись в recipe_translations через Edge translate-recipe + DeepSeek + RPC upsert_recipe_translation. Переводные токены тратятся только когда включены VITE_ENABLE_RECIPE_TRANSLATION / ENABLE_RECIPE_TRANSLATION, передан target_locale, и target_locale ≠ base locale; при same-locale или при уже существующем переводе — skipped. **Для RU-only rollout** флаги не задают — авто-перевод не выполняется.

**Scope (сделано):**
- Post-save шаг: после успешного create_recipe_with_steps (или после ответа deepseek-chat) вызов translate-recipe (Edge), запись в recipe_translations title/description/chef_advice.
- translation_status/source (auto_generated), идемпотентность по (recipe_id, locale), has_recipe_translation перед LLM.
- Failure-safe: сбой перевода не откатывает сохранение рецепта; рецепт уже в recipes, пользователь видит контент по fallback.

**Out of scope:**
- Обработка уже существующих (старых) рецептов (ML-6 backfill — см. future note в recipe-core-multilang-progress.md).
- Локализация steps/ingredients.

---

### ML-6 — Backfill existing recipes (deferred)

**Goal:** Перевести существующую базу рецептов, чтобы пользователи с локалью en/es видели контент не только для новых рецептов.

**Статус: отложен.** В задаче ML-7 массовый backfill не делается. Старые рецепты без переводов работают через runtime fallback. Будущая стратегия (cleanup, приоритизация, одна локаль en, idempotent cost-aware batch) — в [recipe-core-multilang-progress.md](./recipe-core-multilang-progress.md) § Future note: ML-6 backfill.

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

### ML-7 — Steps & ingredients localization (implemented)

**Goal:** Полный перевод рецепта: не только title/description/chef_advice, но и шаги и названия ингредиентов.

**Реализовано (без ML-6 backfill):**
- **Steps:** Таблица recipe_step_translations (recipe_step_id, locale, instruction, translation_status, source). get_recipe_full возвращает локализованный steps_json с fallback на recipe_steps.instruction.
- **Ingredients:** Таблица recipe_ingredient_translations (recipe_ingredient_id, locale, name, display_text, translation_status, source). get_recipe_full возвращает ingredients_json с fallback на recipe_ingredients. Per-recipe overlay, без глобального ingredient_dictionary.
- **RPC:** upsert_recipe_step_translation, upsert_recipe_ingredient_translation; has_recipe_steps_translation, has_recipe_ingredients_translation, has_recipe_full_locale_pack. translate-recipe (Edge) переводит и записывает steps + ingredients; skip по полному locale pack.
- **Scope:** только новые и активные рецепты; старые без переводов — runtime fallback. Batch backfill не входит в задачу.

**Out of scope (соблюдено):**
- Контракт создания рецепта не менялся; перевод — отдельный слой.
- ingredient_dictionary не делается.

### RU-only rollout behavior

- Translation pipeline is implemented but disabled
- All recipes are stored in base locale (ru)
- UI uses fallback for non-translated content
- No translation cost is incurred

### Future EN rollout switch

Translation can be enabled instantly by:

- setting `ENABLE_RECIPE_TRANSLATION=true`
- optionally enabling frontend trigger
- ensuring target_locale is passed

No schema or logic changes required.

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

- **ML-7 выполнен** без ML-6 backfill: полная локализация steps + ingredients, fallback для старых рецептов, translate-recipe расширен. **ML-6 отложен.** ML-8 (generation) зависит от качества модели по языкам. ML-9 (UI i18n) можно вести параллельно при наличии ресурсов.

**Рекомендуемый порядок:** ML-4 → ML-5 → ML-7 (выполнен) → при необходимости ML-6 backfill позже → ML-8 или ML-9.

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
