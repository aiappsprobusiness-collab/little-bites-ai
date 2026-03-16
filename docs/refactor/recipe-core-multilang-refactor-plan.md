# Recipe Core & Multilang Refactor Plan

План поэтапного рефактора ядра рецептов, мультиязычности (ru/en/es), пула/доверия и подготовки к nutrition goals без полного переписывания продукта.

**Контекст:** проект рабочий; ломать существующие user flows нельзя. Цель — целевая архитектура recipe core, подготовка БД к мультиязычности и масштабированию, управляемый пул рецептов, foundation для nutrition goals и безопасная поэтапная миграция.

---

## 1. Current State Audit

### 1.1 Таблицы и RPC, связанные с рецептами

| Сущность | Назначение | Язык/локаль | Проблемы для мультиязычности и масштабирования |
|----------|------------|-------------|-----------------------------------------------|
| **recipes** | Ядро рецепта: title, description, chef_advice, meal_type, source, tags, nutrition, servings, is_soup, min/max_age_months | Все текстовые поля — один язык (фактически RU) | title/description/chef_advice/advice — language-specific, смешаны с language-agnostic (meal_type, source, calories). Нет поля locale/source_lang. |
| **recipe_ingredients** | name, display_text, amount, unit, category, substitute | name/display_text — один язык | Нет связи со словарём ингредиентов; переводы только через дублирование записей или будущие translation-таблицы. |
| **recipe_steps** | step_number, instruction | instruction — один язык | Нет locale; шаги не локализуемы без отдельной таблицы или jsonb по локалям. |
| **members** | Профили семьи, allergies, likes, dislikes, preferences | Тексты аллергий/лайков — в интерфейсе пользователя | Язык интерфейса ≠ кухня; предпочтения по продуктам лучше хранить нормализованно (см. allergy_items). |
| **favorites_v2** | user_id, recipe_id, member_id, recipe_data (legacy) | recipe_data — кэш, может содержать title/description | Избыточный кэш; основной источник — recipes по recipe_id. |
| **meal_plans_v2** | planned_date, meals (jsonb: breakfast/lunch/snack/dinner) | В слоте: recipe_id, title, servings | title в слоте — денормализация для отображения; при смене локали нужно будет подставлять перевод или оставить fallback на recipes.title. |
| **meal_plans** | Классический слот: recipe_id, planned_date, meal_type | — | Legacy; используется вместе с v2. |
| **chat_history** | message, response, recipe_id, meta | message/response — язык пользователя | Не блокирует мультиязычность рецептов; рецепт хранится в recipes. |
| **usage_events** | feature, user_id, properties | — | Язык-агностичен. |
| **token_usage_log** | action_type, tokens | — | Язык-агностичен. |

**RPC и Edge, где создаются/сохраняются рецепты:**

- **create_recipe_with_steps(payload jsonb)** — единственная точка записи рецепта + steps + ingredients. Используется из:
  - `deepseek-chat/index.ts` (чат-рецепт),
  - `generate-plan/index.ts` (replace_slot, week_ai),
  - клиент `useRecipes.tsx` → createRecipe (редко, при fallback сохранения).
- **get_recipe_previews(recipe_ids)** — превью для карточек; возвращает title, description, ingredient_names, is_favorite. Доступ: свои рецепты + user_custom по owner_user_id + **пул** (seed, starter, manual, week_ai, chat_ai) для любого авторизованного.
- **get_recipe_full(recipe_id)** — полный рецепт + steps_json + is_favorite. Доступ: user_id = auth.uid() ИЛИ owner_user_id = auth.uid() для user_custom. **Важно:** для рецептов пула с user_id ≠ auth.uid() (если в будущем будет общий каталог) get_recipe_full не вернёт строку — сейчас пул копируется под user_id при сиде/стартере, поэтому для текущей модели это ок.
- **assign_recipe_to_plan_slot** — обновляет meal_plans_v2.meals; не меняет recipes (в т.ч. meal_type/is_soup).
- **get_recipe_by_share_ref** — публичное чтение рецепта по короткой ссылке (anon).

**Итог аудита БД:**

- Переиспользовать: структуру recipes (id, user_id, member_id, meal_type, source, tags, cooking_time_minutes, min/max_age_months, calories, proteins, fats, carbs, servings_base, servings_recommended, is_soup, generation_context, allergens, visibility, owner_user_id), recipe_ingredients (category, canonical_amount/unit, order_index), recipe_steps (step_number, instruction), RLS и индексы пула.
- Смешивание language-specific и language-agnostic: в одной таблице recipes лежат title, description, chef_advice, advice (всё по сути на одном языке) рядом с meal_type, source, nutrition. Это мешает мультиязычности: нельзя хранить несколько локалей без дублирования строк или выноса текстов в переводы.
- Модель рецептов мешает nutrition goals: нет полей для целей/трайтов (balanced, weight_loss_support, iron_support и т.д.); только tags (произвольные строки) и нет нормализованной таксономии.
- Quality/pool management: есть source (chat_ai, week_ai, seed, starter, manual, user_custom), но нет явного trust level (seed/candidate/trusted/blocked), нет quality_score или флагов «проверен редактором».

### 1.2 Edge и доменные файлы (размер и связность)

- **deepseek-chat/index.ts** — ~1320 строк. В одном файле: CORS, auth, профиль, лимиты, маршрутизация (assistant_topic, irrelevant), policy block, сборка контекста семьи, сборка system prompt, вызов LLM, парсинг/валидация/retry рецепта, quality gate описания/совета, repair description, санитизация, сохранение через create_recipe_with_steps, usage_events, token_usage_log, ответ. Всё в одном serve()-колбэке.
- **buildPrompt.ts** — ~313 строк; сборка промпта (шаблоны, возраст, семья, mealType, recentTitleKeys).
- **prompts.ts** — большой объём констант (шаблоны, правила, AGE_CONTEXTS, MEAL_SOUP_RULES и т.д.).
- **generate-plan/index.ts** — ~900+ строк; логика пула (fetchPoolCandidates, pickFromPool), sanity, возраст, аллергии, replace_slot, week_ai, создание рецептов через create_recipe_with_steps.

Логика размазана: часть в index.ts, часть в domain/recipe_io, domain/policies, domain/meal, domain/family, _shared (recipeCanonical, recipeCopy, parsing, blockedTokens). Описание и совет шефа собираются и в recipeCopy (buildRecipeDescription, buildChefAdvice), и в recipe_io (sanitizeAndRepair, enforceDescription, enforceChefAdvice, repairDescriptionOnly). Нет явного слоя «compose description from taxonomy/ingredients» без полного вызова LLM.

### 1.3 Где UI ожидает title/description в recipes

- **RecipePage** — recipe.title, recipe.description (get_recipe_full).
- **FavoriteCard / favoriteCardViewModel** — title, description из превью или recipe_data.
- **MealPlanPage / useMealPlans** — в слоте хранится title (meal.recipe?.title, slot.title); при отображении карточек подгружаются превью через get_recipe_previews(recipe_ids).
- **ChatRecipeCard** — title, description из ответа API.
- **RecipeCard, FamilyDashboard** — recipe.title, recipe?.title.
- **Shopping list** — recipe_title в слоте и в shopping_list_items.

Обратная совместимость: пока UI читает title/description из рецепта (напрямую или через RPC), новые переводы должны либо подставляться в те же поля через view/RPC с учётом locale, либо дублироваться в recipes на переходный период (см. раздел 9).

---

## 2. Main Architectural Problems

1. **Один язык в ядре рецепта:** title, description, chef_advice, steps.instruction, ingredient name/display_text — всё в одном «языковом слое»; нет разделения на language-agnostic core и локализованный контент.
2. **Раздутый index.ts (deepseek-chat):** один файл ~1320 строк; парсинг, валидация, описание, сохранение и оркестрация в одном месте. Сложно тестировать и менять по частям.
3. **Описание рецепта каждый раз от LLM:** при плохом качестве делается repairDescriptionOnly или полный retry; нет дешёвого «description composer» на основе категории/ингредиентов/таксономии без полного вызова модели.
4. **Нет управляемого пула с уровнями доверия:** все рецепты с source in (seed, starter, chat_ai, week_ai, manual) равны с точки зрения «доверия»; нет candidate → trusted, нет блокировки по качеству.
5. **Нет задела под nutrition goals:** нельзя помечать рецепт как подходящий под «железо», «энергия», «похудение» без введения трайтов/тегов и их использования в ранжировании.
6. **План (MealPlanPage):** страница большая (~1738 строк), много состояний (fill day/week, replace, job, toasts, paywall, A2HS); день/неделя и действия смешаны; визуальный шум и несколько CTA.

---

## 3. Target Recipe Core Model

Цель: разделить language-agnostic ядро и локализованный контент, не ломая текущий UI на первом этапе.

### 3.1 Таблицы: оставить, расширить, добавить

**Оставить и использовать как есть (с минимальными дополнениями):**

- **recipes** — остаётся главной таблицей. Добавить колонки (в миграциях):
  - `locale` text (например 'ru', 'en', 'es') — язык контента этой строки. По умолчанию 'ru'.
  - `source_lang` text (nullable) — язык, на котором сгенерирован контент (для AI: manual/ai/imported).
  - `trust_level` text (nullable) — см. раздел 5 (seed | candidate | trusted | blocked). По умолчанию для chat_ai/week_ai — candidate; для seed/starter/manual — trusted.
  - Опционально: `nutrition_traits` jsonb (см. раздел 6) — на первом этапе можно не добавлять, а ввести позже.

Текущие поля title, description, chef_advice, advice **оставить**. Они становятся «дефолтной локалью» (ru или выбранная при создании). Обратная совместимость: UI продолжает читать title/description; при появлении recipe_translations выбор по locale будет в RPC/view.

- **recipe_ingredients** — оставить. Для мультиязычности: добавить опционально `ingredient_id` uuid → ingredient_dictionary(id), когда появится словарь. Поле name/display_text остаётся для обратной совместимости и для «свободного» текста от AI.

- **recipe_steps** — оставить. Локализация шагов: либо отдельная таблица recipe_step_translations (step_id, locale, instruction), либо на первом этапе один язык в instruction; переводы — этап 2.

**Расширить:**

- **recipes:** см. выше (locale, source_lang, trust_level; при необходимости nutrition_traits в отдельной миграции).

**Новые таблицы (вводить по этапам):**

- **recipe_translations** (stage 2):
  - id uuid PK
  - recipe_id uuid NOT NULL → recipes(id) ON DELETE CASCADE
  - locale text NOT NULL (ru, en, es)
  - title text, description text, chef_advice text
  - translation_status text (draft | auto_generated | reviewed)
  - source text (manual | ai | imported)
  - created_at, updated_at
  - UNIQUE(recipe_id, locale)

  Использование: при запросе рецепта по locale приложение или RPC отдаёт title/description/chef_advice из recipe_translations для этой локали, иначе fallback на recipes.title/description/chef_advice.

- **ingredient_dictionary** (stage 2, можно отложить):
  - id uuid PK
  - canonical_name text (нормализованное имя, например для кросс-локалей)
  - category product_category
  - created_at

- **ingredient_translations** (stage 2):
  - ingredient_id uuid → ingredient_dictionary
  - locale text
  - display_name text
  - UNIQUE(ingredient_id, locale)

Практический подход: на **первом этапе** не обязательно заводить ingredient_dictionary; можно хранить в recipe_ingredients только name/display_text и добавить опционально locale на уровне рецепта (все ингредиенты рецепта в одной локали). Переводы названий ингредиентов тогда — либо в recipe_translations в виде jsonb `ingredient_display_names: { "ingredient_1": "Carrot", ... }`, либо отдельная таблица позже.

- **recipe_feedback** (stage 2 или 3, по желанию):
  - id uuid PK
  - recipe_id uuid → recipes
  - user_id uuid
  - rating smallint, comment text
  - created_at

Для качества пула и перехода candidate → trusted можно начать с простого: trust_level в recipes + ручной/скриптовый апдейт. recipe_feedback — для сбора сигналов позже.

**Таксономия / теги / цели (раздел 6):** на первом этапе достаточно jsonb в recipes:

- **recipes.nutrition_traits** jsonb (nullable), например: `["balanced", "iron_support", "energy"]` или `{ "goals": ["balanced_everyday"], "tags": ["quick"] }`. Не хардкодить «этот рецепт для мозга» в логике; хранить трайты, из которых потом строятся цели.

### 3.2 Что не делать на первом этапе

- Не дробить recipes на «recipe_core» без title/description: это потребует переноса всех чтений в join с переводом и усложнит миграцию. Лучше: оставить title/description в recipes как дефолтную локаль, добавить recipe_translations для дополнительных языков.
- Не вводить отдельные таблицы для каждого типа метаданных (cuisine, region, familiarity) сразу; при необходимости хранить в tags или в jsonb metadata до стабилизации модели.

---

## 4. Multilingual Strategy (ru / en / es)

### 4.1 Принципы

- Язык интерфейса пользователя ≠ кухня. Пользователь может выбрать русский интерфейс и при этом предпочитать рецепты средиземноморской кухни.
- locale храним в формате ISO 639-1: ru, en, es.
- Titles, descriptions, chef_advice, steps, display names ингредиентов должны быть готовы к локализации.
- Часть переводов может быть auto-generated и требовать review (translation_status: auto_generated → reviewed).

### 4.2 Хранение locale

- **recipes.locale** — язык контента записи (текущий дефолт 'ru'). При создании рецепта из чата/плана передавать locale из запроса (заголовок, профиль пользователя или параметр).
- **recipe_translations.locale** — язык перевода строки (en, es, ru если храним копию для единообразия).
- В **members** или **profiles_v2** можно добавить **preferred_locale** (опционально) — для подстановки в API и в RPC при отдаче рецептов. На первом этапе можно определять locale по заголовку Accept-Language или параметру ?locale=.

### 4.3 Translation status и source

- **recipe_translations.translation_status:** draft | auto_generated | reviewed. Позволяет фильтровать «проверенные» переводы в UI и в пуле.
- **recipe_translations.source:** manual | ai | imported. Понятно, откуда перевод (ручной ввод, автоперевод, импорт).

### 4.4 Обратная совместимость с текущим UI

- Текущий UI ожидает title/description в рецепте. Варианты:
  - **Вариант A (рекомендуемый):** RPC get_recipe_previews и get_recipe_full принимают опциональный параметр `p_locale`. Если передан и есть запись в recipe_translations для (recipe_id, p_locale), подставлять title/description/chef_advice из recipe_translations; иначе возвращать recipes.title, recipes.description, recipes.chef_advice. Таким образом старые клиенты без параметра получают текущее поведение (фактически ru).
  - **Вариант B:** На переходном этапе не трогать возвращаемые поля; в recipes по-прежнему пишем title/description на «основном» языке (ru). Переводы только в recipe_translations для en/es). Когда клиент перейдёт на передачу locale, RPC начнёт отдавать перевод.
- В **meal_plans_v2.meals** в слоте хранится title — это кэш для отображения. При смене локали можно либо пересчитывать title при отдаче плана по locale (из recipe_translations или recipes), либо оставить как есть и показывать в выбранной локали только при открытии рецепта. Минимальный риск: оставить title в слоте как есть; на экране рецепта показывать по get_recipe_full(p_locale).

---

## 5. Pool and Trust Model

Цель: управляемый пул без отказа от chat-generated рецептов; понятная схема перехода в «доверенные» и исключения из пула.

### 5.1 Уровни доверия (trust_level)

- **seed** — сидовые рецепты (проверенные, статичный набор). Соответствует source = 'seed'.
- **starter** — стартовый набор при онбординге. source = 'starter'.
- **trusted** — проверенные вручную или по правилам (например, N положительных фидбеков, или промоут из candidate). Может применяться к source = 'manual', части week_ai/chat_ai после модерации.
- **candidate** — новые AI-рецепты (chat_ai, week_ai), по умолчанию попадают сюда. Участвуют в пуле, но могут быть по приоритету ниже trusted при ранжировании.
- **blocked** — исключены из пула (качество, жалобы, дубликат). Не показываются в автозаполнении и в выборе «из пула».

Поле в БД: **recipes.trust_level** text, CHECK (trust_level IS NULL OR trust_level IN ('seed','starter','trusted','candidate','blocked')). По умолчанию при создании: для source in ('seed','starter','manual') — trusted; для source in ('chat_ai','week_ai') — candidate. NULL трактовать как candidate для обратной совместимости.

### 5.2 Как новый рецепт попадает в candidate

- При вызове create_recipe_with_steps с source = 'chat_ai' или 'week_ai' выставлять trust_level = 'candidate'. Рецепт сразу попадает в пул (get_recipe_previews и выборка пула в generate-plan уже фильтруют по source; добавить в фильтр пула: trust_level IS DISTINCT FROM 'blocked').

### 5.3 Как повышается trust

- Вручную: UPDATE recipes SET trust_level = 'trusted' WHERE id = ?.
- Полуавтоматически: джоб/скрипт по правилам (например, рецепт в избранном у > N пользователей и без жалоб).
- Позже: на основе recipe_feedback (средний рейтинг, количество приготовлений).

### 5.4 Как рецепт исключается из пула

- UPDATE recipes SET trust_level = 'blocked' WHERE id = ?. В выборке пула (generate-plan, клиент) условие: trust_level IS DISTINCT FROM 'blocked' (и не NULL при желании считать NULL как candidate).

### 5.5 Ранжирование: locale, cuisine, familiarity

- **Не** делать жёсткую привязку language = cuisine. Хранить отдельно:
  - **recipes.locale** (или контент в recipe_translations) — язык контента.
  - Опционально в tags или jsonb: **cuisine** (e.g. mediterranean, russian), **familiarity** (classic, modern), **region**. Это метаданные рецепта для ранжирования.
- В ранжировании учитывать: предпочтение locale пользователя (preferred_locale), предпочтение кухни/региона по профилю (если добавим), familiarity. Скоринг: не жёсткий фильтр «только en», а мягкий буст для совпадения locale/cuisine и понижение для blocked.

---

## 6. Future Nutrition Goals Foundation

Цель: заложить основу для целей питания (balanced_everyday, weight_loss_support, weight_gain_support, brain_support, iron_support, energy_support) без хардкода «этот рецепт для мозга».

### 6.1 Модель: трайты и цели

- **Nutrition traits** — признаки рецепта, по которым потом строятся цели. Примеры: high_iron, high_protein, low_calorie, balanced_macros, omega3, complex_carbs, quick_energy.
- **Goals** — цели пользователя или сценарии: balanced_everyday, weight_loss_support, weight_gain_support, brain_support, iron_support, energy_support. Каждая цель маппится на набор трайтов (например iron_support → high_iron + vitamin_c).
- Рецепт не помечается как «для мозга», а помечается трайтами; ранжирование «для цели brain_support» выбирает рецепты с подходящими трайтами.

### 6.2 Хранение на первом этапе

- **recipes.nutrition_traits** jsonb (nullable). Формат: массив строк или объект, например `["balanced", "high_iron", "quick"]` или `{ "tags": ["balanced", "high_iron"], "suitability": ["iron_support", "energy_support"] }`. Предпочтительно массив строк трайтов: `["balanced", "high_iron", "quick"]`.
- Отдельные таблицы goal_tags и nutrition_traits на первом этапе не обязательны; можно ввести позже для нормализации и админки. В ранжировании пула и плана: если у пользователя выбран goal (в профиле или в контексте запроса), фильтровать/бустить рецепты, у которых в nutrition_traits есть трайт, входящий в цель.
- RPC create_recipe_with_steps можно расширить опциональным полем payload.nutrition_traits (массив строк); при наличии — писать в recipes.nutrition_traits. Генерация трайтов: либо по правилам из категории/ингредиентов (овсянка → energy, печень → iron), либо отдельным лёгким вызовом LLM/классификатором позже.

---

## 7. Description Composer Strategy

Цель: уменьшить зависимость от полного LLM для описания; стабильные, короткие, «тёплые» описания для мам; меньше токенов и быстрее генерация.

### 7.1 Текущее состояние

- Описание генерируется моделью в одном JSON с рецептом. При плохом качестве: repairDescriptionOnly (доп. вызов LLM) или полный retry. Уже есть fallback: buildRecipeDescription (recipeCopy.ts) по title + keyIngredient + шаблонам (FIRST_SENTENCES, SECOND_SENTENCES и т.д.); buildChefAdviceFallback для совета.
- Шаблоны заточены под русский язык и «мамский» тон.

### 7.2 Целевой подход

- **Слой compose description (без полного LLM):** на основе taxonomy/category, списка ингредиентов (категории product_category), meal_type и title собирать описание из шаблонов (как в recipeCopy), с подстановкой {{title}}, {{keyIngredient}}, mealType. Использовать это как первый вариант; вызывать LLM только если нужен «особый» текст по запросу пользователя или если шаблонный вариант не подходит (например, сложное блюдо).
- **В пайплайне генерации:** после получения JSON рецепта от модели проверять passesDescriptionQualityGate; если не проходит — не обязательно сразу вызывать repairDescriptionOnly; попробовать **composeDescriptionFromTemplate**(title, ingredients, mealType, category) из существующих FIRST_SENTENCES/SECOND_SENTENCES. Если результат проходит гейт — подставить его и не вызывать LLM для описания. Иначе — repairDescriptionOnly или fallback buildRecipeDescription/buildDescriptionFallback.
- **Локализация шаблонов:** вынести шаблоны в структуру по locale (ru/en/es); при добавлении locale в запрос подставлять шаблоны нужного языка. Это уменьшит токены при мультиязычной генерации и даст стабильный тон.
- **Итог:** описание «понятное для мам», короткое, без медицинских перегибов и галлюцинаций — за счёт шаблонов и правил; LLM — для вариативности и сложных кейсов, с fallback на composer.

### 7.3 Модуль composer

- Вынести в отдельный модуль (например deepseek-chat/domain/descriptionComposer.ts или _shared/descriptionComposer.ts): composeDescriptionFromTemplate(title, ingredients, mealType, locale?), getKeyIngredient(ingredients), pickFirstSecondThirdSentences(…). Использовать в deepseek-chat после валидации рецепта вместо немедленного repairDescriptionOnly там, где достаточно шаблона.

---

## 8. Edge / Domain Refactor Plan

Цель: разрезать жирный index.ts и большие доменные файлы на понятные слои без смены контракта API.

### 8.1 Целевая модульная схема (deepseek-chat)

- **parseRequest** — разбор body, нормализация memberData, type, mealType, memberId, targetIsFamily. Вынести в отдельный модуль или функцию в index.
- **loadContext** — загрузка профиля (profiles_v2), лимиты, члены семьи (если нужны с сервера), resolveFamilyStorageMemberId. Отдельная функция/модуль.
- **buildPrompt** — уже вынесен в buildPrompt.ts; оставить, при необходимости разбить на buildSystemPrompt / buildRecipePrompt / buildNonRecipePrompt.
- **routeRequest** — detectAssistantTopic, checkFoodRelevance; возврат redirect/irrelevant или продолжение. Явная функция.
- **checkPolicies** — checkRecipeRequestBlocked (аллергии, dislikes). Уже в domain/policies.
- **generateRecipe** — вызов LLM (payload, model, max_tokens). Вынести в отдельную функцию (например invokeDeepSeek), чтобы index только собирал payload и вызывал.
- **postProcessRecipe** — validateRecipe, retryFixJson, getRecipeOrFallback, quality gate описания/совета, repairDescriptionOnly, composeDescriptionFromTemplate (новое), enforceDescription, enforceChefAdvice, sanitize*. Всё, что идёт после получения ответа модели до формирования responseRecipes. Вынести в domain/recipe_io или в новый domain/recipePostProcess.ts.
- **classifyRecipe** — опционально: определение meal_type, tags, nutrition_traits по правилам (без LLM). Можно в _shared или domain/meal + новый маленький модуль taxonomy.
- **persistRecipe** — сборка payload для create_recipe_with_steps (canonicalizeRecipePayload), вызов RPC. Уже частично в index; вынести в одну функцию saveRecipeToDb(validatedRecipe, context) в _shared или domain/recipe_io.
- **buildResponse** — сборка JSON ответа (message, recipes, recipe_id, auth_required_to_save). Простая функция.

В index.ts остаётся только оркестрация: parseRequest → loadContext → routeRequest → checkPolicies → buildPrompt → generateRecipe → postProcessRecipe → persistRecipe → buildResponse, плюс запись usage_events и token_usage_log. Объём index.ts сократить до ~300–400 строк за счёт выноса в перечисленные модули.

### 8.2 generate-plan

- Логику пула (fetchPoolCandidates, pickFromPool, sanity, фильтры по возрасту/аллергиям) оставить в index или вынести в plan/poolPicker.ts. Создание рецепта через create_recipe_with_steps уже централизовано; при добавлении trust_level и locale — передавать в payload в create_recipe_with_steps.

### 8.3 Файлы и порядок изменений

- Создать domain/request.ts (parseRequest, loadContext), domain/route.ts (routeRequest), domain/recipePostProcess.ts (postProcessRecipe), _shared/recipePersistence.ts или domain/recipe_io/persist.ts (persistRecipe).
- Поочерёдно переносить блоки из index.ts в эти модули и вызывать их из index. Тесты: существующие domain/*.test.ts; добавить тесты для postProcess и persist по мере выноса.

---

## 9. Backward Compatibility and Staged Migration

### 9.1 Stage 1 (без ломки UI)

- Миграции:
  - Добавить в recipes колонки: locale (DEFAULT 'ru'), source_lang (nullable), trust_level (nullable). Для существующих строк: UPDATE recipes SET locale = 'ru' WHERE locale IS NULL; trust_level по правилу: source IN ('seed','starter','manual') → 'trusted', source IN ('chat_ai','week_ai') → 'candidate'.
  - В RPC create_recipe_with_steps: принимать в payload опционально locale, source_lang, trust_level; при отсутствии задавать дефолты (locale 'ru', trust_level по source).
- Код:
  - В deepseek-chat и generate-plan при вызове create_recipe_with_steps передавать locale (из заголовка или 'ru'), trust_level = 'candidate' для chat_ai/week_ai.
  - В выборке пула (generate-plan, клиент pickFromPool): добавить условие AND (recipes.trust_level IS NULL OR recipes.trust_level <> 'blocked').
- UI: не меняется; по-прежнему читает title/description из рецепта. get_recipe_previews и get_recipe_full не меняют сигнатуру.

### 9.2 Stage 2 (переводы и RPC с locale)

- Миграции:
  - Создать recipe_translations (recipe_id, locale, title, description, chef_advice, translation_status, source, created_at, updated_at).
  - Опционально: ingredient_dictionary + ingredient_translations или отложить.
- RPC:
  - get_recipe_previews(recipe_ids, p_locale text DEFAULT NULL): при p_locale не NULL джойн с recipe_translations по (recipe_id, p_locale), подставлять title/description из перевода при наличии; иначе из recipes.
  - get_recipe_full(p_recipe_id, p_locale text DEFAULT NULL): аналогично для полного рецепта и шагов (шаги пока в одной локали в recipe_steps; при необходимости позже recipe_step_translations).
- Edge: при создании рецепта можно писать дефолтную локаль в recipes; переводы en/es заполнять отдельно (импорт, админка, или автоперевод с флагом auto_generated).
- UI: передача locale в запросы (из профиля или выбора языка). Fallback: без locale — как сейчас (recipes.title/description).

### 9.3 Stage 3 (nutrition_traits, feedback, чистка)

- Миграции:
  - recipes.nutrition_traits jsonb (nullable).
  - При необходимости recipe_feedback.
- RPC create_recipe_with_steps: принимать nutrition_traits, писать в recipes.
- Ранжирование в пуле и в плане: учитывать nutrition_traits и цели пользователя (если добавим поле цели в профиль). По желанию: админка для trust_level и модерации candidate → trusted.

### 9.4 Порядок и безопасность

- Не удалять старые поля (title, description) из recipes до тех пор, пока все клиенты не перейдут на выборку по locale через RPC. Переходный период: оба источника (recipes и recipe_translations) с приоритетом перевода при указании locale.
- Все изменения в БД — только через миграции в supabase/migrations/. После изменений схемы обновлять docs/database/DATABASE_SCHEMA.md в том же коммите.

---

## 10. Plan Page Refactor Recommendations

На этом этапе не переписывать весь Plan UI; подготовить рекомендации для последующего UX-рефактора.

### 10.1 Текущая связность

- **MealPlanPage.tsx** (~1738 строк): календарь/неделя, выбор члена семьи (MemberSelectorButton), кнопки «Заполнить день» / «Заполнить неделю», replace по слоту, прогресс джобы (usePlanGenerationJob), тосты (partial fill, ошибки, paywall), A2HS, шаринг плана, дебаг (isPlanDebug, isPerf). Данные: useMealPlans (meal_plans_v2), useRecipePreviewsByIds (карточки рецептов), useReplaceMealSlot, useFavorites, useRecipes.
- **useMealPlans.tsx:** запрос meal_plans_v2 по диапазону дат, expandMealsRow (разворот meals jsonb в ряд по слотам), assign_recipe_to_plan_slot, инвалидация кэша. Слот содержит recipe_id, title, servings, ingredient_overrides.
- Зависимости: FamilyContext, useSubscription (лимиты, paywall), usePlanGenerationJob (статус генерации), dateRange utils, planCache, sharedPlan.

### 10.2 Узкие места

- Один огромный компонент: и день, и неделя, и все действия в одном файле — сложно читать и тестировать.
- Несколько CTA рядом: «Заполнить день», «Заполнить неделю», replace по каждому слоту, «В избранное» и т.д. Главный сценарий (заполнить день/неделю) не всегда визуально выделен.
- Визуальный шум: много карточек, дропдауны, бейджи (pool/ai), тосты. Упрощение отображения слота (одна карточка на приём с чётким CTA «Заменить» / «Добавить») упростит восприятие.
- Данные для UI: план приходит как массив дней с meals; для отображения подтягиваются превью рецептов по recipe_id. При рефакторе можно ввести селектор «план на день/неделю в виде плоской структуры по слотам» (дата + meal_type + recipe_id + title), чтобы дочерние компоненты не знали про meal_plans_v2.

### 10.3 Safe decomposition

- **Компоненты:** выделить DayPlanCard (один день: дата, 4 слота, кнопка «Заполнить день»), WeekPlanStrip (неделя: список DayPlanCard или компактная сетка), MealSlotCard (один слот: превью рецепта или плейсхолдер, кнопка «Заменить»/«Добавить»). Вынести в отдельные файлы с пропсами только нужными для отображения и колбэков (onFillDay, onReplaceSlot).
- **Хуки:** оставить useMealPlans как источник истины; выделить usePlanDaySlots(dayKey) или useExpandedPlan(start, end) — возвращает плоский список слотов с recipe_id, title, meal_type, date для удобства рендера. useRecipePreviewsByIds уже есть; не дублировать загрузку.
- **Селекторы:** вынести маппинг meal_plans_v2 → «слоты по дням» в утилиту или хук (getSlotsByDay(rows)), чтобы MealPlanPage только рендерил по данным, не смешивая логику разбора meals jsonb с разметкой.
- **Главный CTA:** визуально выделить одну основную кнопку («Заполнить день» или «Заполнить неделю») в зависимости от контекста (один день выбран vs неделя); вторичные действия (replace, избранное) — в меню или иконки на карточке слота.
- **День vs неделя:** разделить режимы «план на один день» и «план на неделю» в навигации или табах; уменьшить количество элементов на одном экране и разнести действия по контексту (день: заполнить день, заменить слот; неделя: заполнить неделю, обзор).

### 10.4 Подготовка данных под простой UI

- Структура «план = список слотов»: массив { date, mealType, recipeId, title?, servings?, planSource? }. Её можно получать из useMealPlans + expandMealsRow или из нового селектора. Карточки плана тогда рендерят только слоты; превью подгружаются по recipeId списком (useRecipePreviewsByIds). Это уже близко к текущему подходу; достаточно формализовать тип PlanSlot и передавать его вниз, не прокидывая весь row meal_plans_v2.

---

## 11. Concrete List of Migrations / Files / Modules to Change First

### 11.1 Миграции (по порядку)

1. **recipe_locale_trust** (Stage 1): добавить в recipes колонки locale (text DEFAULT 'ru'), source_lang (text), trust_level (text CHECK IN ('seed','starter','trusted','candidate','blocked')); backfill locale = 'ru', trust_level по source; индексы при необходимости (trust_level для пула).
2. **recipe_translations** (Stage 2): создать таблицу recipe_translations (recipe_id, locale, title, description, chef_advice, translation_status, source, created_at, updated_at); UNIQUE(recipe_id, locale); RLS по recipe_id (чтение через рецепт).
3. **recipe_nutrition_traits** (Stage 3): добавить recipes.nutrition_traits jsonb; расширить create_recipe_with_steps для приёма nutrition_traits.

### 11.2 RPC

1. **create_recipe_with_steps:** в миграции Stage 1 добавить в INSERT поля locale, source_lang, trust_level из payload (с дефолтами).
2. **get_recipe_previews:** в Stage 2 добавить опциональный параметр p_locale; при наличии — LEFT JOIN recipe_translations и COALESCE(rt.title, r.title), COALESCE(rt.description, r.description).
3. **get_recipe_full:** в Stage 2 добавить p_locale; аналогично подставлять title, description, chef_advice из recipe_translations.
4. Выборка пула в generate-plan и в клиенте: добавить условие по trust_level (не blocked). Это изменение в SQL запросе в Edge и в клиенте (если есть прямой запрос к recipes).

### 11.3 Edge / модули

1. **deepseek-chat:** разбить index.ts на parseRequest, loadContext, routeRequest, postProcessRecipe, persistRecipe, buildResponse; вынести в domain/ и _shared (см. раздел 8). Добавить передачу locale и trust_level в create_recipe_with_steps (Stage 1).
2. **descriptionComposer:** новый модуль _shared/descriptionComposer.ts или domain/descriptionComposer.ts; использовать в postProcessRecipe до repairDescriptionOnly.
3. **generate-plan:** при создании рецепта передавать locale (из запроса или 'ru'), trust_level = 'candidate'; в fetchPoolCandidates добавить фильтр trust_level <> 'blocked'.

### 11.4 Документация

- Обновить **docs/database/DATABASE_SCHEMA.md**: описать новые колонки recipes (locale, source_lang, trust_level), таблицу recipe_translations, при необходимости nutrition_traits. Указать расширенные сигнатуры RPC get_recipe_previews и get_recipe_full с параметром p_locale.
- Обновить **docs/architecture/chat_recipe_generation.md**: поток с учётом locale и trust_level; ссылка на description composer при наличии.
- При изменении пула/плана: **docs/dev/POOL_AND_CHAT_RECIPES.md** — добавить trust_level и условие по blocked.
- При изменении страницы План (только после рефактора UI): кратко описать decomposition в docs/architecture или docs/refactor.

---

Итог: сначала максимально использовать существующую схему (recipes, recipe_ingredients, recipe_steps, RPC); ввести locale и trust_level без ломки UI; затем добавить recipe_translations и опциональный p_locale в RPC; вынести описание в composer и разбить index.ts на слои; подготовить nutrition_traits и рекомендации по Plan UI для последующего рефактора.
