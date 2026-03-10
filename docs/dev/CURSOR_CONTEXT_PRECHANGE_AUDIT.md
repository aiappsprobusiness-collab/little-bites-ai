# Cursor Context Pre-Change Audit

## 1. Executive summary

Проведён read-only аудит системы проектного контекста после реорганизации документации. Правила Cursor представлены одним rule-файлом (deploy). Документация в `docs/` структурирована по папкам architecture, analytics, database, decisions, dev; есть явные source-of-truth документы по чату, БД, аналитике и части решений. Обнаружены: два битых пути в ссылках между документами; отсутствие единого документа по engineering rules и по output expectations агента; частичное дублирование и перекрытие темы аллергий/meal_type между документами. Система в целом пригодна для повседневной работы; самое рискованное — менять или объединять source-of-truth документы без отдельного плана. Рекомендуемые первые шаги — точечно исправить ссылки и зафиксировать приоритет документов по спорным темам.

---

## 2. Current context inventory

### 2.1 Cursor rules

- **Папка:** `.cursor/rules/` существует.
- **Файл:** `deploy.mdc`
  - **Назначение:** как деплоить проект (Supabase Edge Functions + фронт).
  - **alwaysApply:** да (`alwaysApply: true`).
  - **Темы:** деплой Supabase (CLI, напр. `npm run supabase:deploy:chat`); деплой фронта только через GitHub (commit + push), запрет Netlify CLI и ручного деплоя фронта; при запросе «задеплоить всё» / «деплой фронта» — предлагать commit + push, а не `netlify deploy`.
  - **Конфликты/дублирование:** с правилами не пересекается. Деплой план-питания и OG описан в docs (PLAN_MEAL_PLANS_DEPLOY.md, share_og_setup.md), но не в rules — дублирования по смыслу нет, rule задаёт только общий принцип (фронт = только GitHub).

Других rule-файлов в `.cursor/rules/` нет. AGENTS.md в репозитории не найден.

### 2.2 Docs used as source of truth

Ниже — документы, которые уже используются или могут служить источниками истины. Оценка: **канонический** (единственный/главный по теме), **частично канонический** (главный в своей подтеме, есть смежные документы), **вспомогательный** (справочник/план/отчёт, не основной SoT).

| Путь | Назначение | Тема | Оценка |
|------|------------|------|--------|
| docs/README.md | Структура docs/, назначение папок, список удалённого при реорганизации | — | Вспомогательный (навигация) |
| docs/architecture/CHAT_HISTORY_SOURCE_OF_TRUTH.md | Где и как хранится история чата, кто пишет/читает chat_history | architecture | Канонический |
| docs/architecture/chat_recipe_generation.md | Генерация рецептов в чате: поток, фильтры, возраст, аллергии, модули Edge, контракты ответа | architecture | Канонический |
| docs/architecture/recipe_save_flow_chat.md | Как рецепт из чата попадает в БД (LLM → parse → RPC), поля возраста/нутриентов/ингредиентов | architecture | Частично канонический (детализация к chat_recipe_generation) |
| docs/architecture/share_og_setup.md | OG-preview для /r/:shareRef и /p/:ref, прокси, деплой share-og / share-og-plan | architecture | Канонический (OG) |
| docs/architecture/welcome_prelogin_routing.md | Маршрутизация /, /welcome, /prelogin, standalone PWA, share CTA | architecture | Канонический |
| docs/analytics/analytics-system.md | События, таблицы, лимиты Free, Product Events, воронка, SQL-примеры | analytics | Канонический |
| docs/analytics/ad-views-chat-free-users.md | Показ рекламы у free во вкладке «Чат», лимиты | analytics | Частично канонический |
| docs/database/DATABASE_SCHEMA.md | Схема БД: таблицы, RLS, enum, важные RPC | database | Канонический |
| docs/database/FIX_SCHEMA_CACHE.md | Ошибка schema cache PostgREST, шаги исправления | database | Вспомогательный |
| docs/decisions/MEAL_TYPE_AND_LUNCH_SOUP.md | meal_type, is_soup, слот обед, пул, assign_recipe_to_plan_slot | decisions | Канонический (meal/plan) |
| docs/decisions/ALLERGIES_AND_PLAN_SOURCE_OF_TRUTH.md | Аллергии и план: активный профиль, фильтрация, guard в чате | decisions | Канонический (аллергии/план) |
| docs/decisions/ALLERGY_ALIASES.md | Алиасы аллергенов (токены) | decisions | Частично канонический (пересекается с chat_recipe_generation, allergens) |
| docs/decisions/PAYMENT_WEBHOOK_WHY_NOT_AUTO.md | Почему premium не ставится без вебхука | decisions | Канонический (платежи) |
| docs/decisions/PAYMENT_PREMIUM_WITHOUT_COMPLETED_PAYMENT.md | Сценарии premium без completed payment | decisions | Частично канонический |
| docs/decisions/PREFERENCES_LIKES_DISLIKES.md, PREFERENCES_BERRIES_RATIO.md | Предпочтения, лайки, ягоды | decisions | Частично канонический |
| docs/decisions/INGREDIENT_CATEGORY_NORMALIZATION.md | Нормализация категорий ингредиентов, диагностика | decisions | Частично канонический |
| docs/decisions/recipe_prompt_sources_for_token_reduction.md | Источники промптов для сокращения токенов | decisions | Вспомогательный |
| docs/decisions/prompts_shortening_proposal.md | Предложения по сокращению промптов | decisions | Вспомогательный |
| docs/dev/PLAN_MEAL_PLANS_DEPLOY.md | Деплой изменений плана (миграции, Edge generate-plan, фронт) | dev/deployment | Частично канонический (деплой плана) |
| docs/dev/dev-notes.md | Таблицы→recipes, recipe age ranges, диагностика, purge legacy | dev | Вспомогательный |
| docs/dev/CHAT_BLOCKED_BEHAVIOR.md | Поведение при blocked-ответах в чате | dev | Вспомогательный |
| docs/dev/unused-edge-functions.md | Какие Edge Functions не используются (список к удалению) | dev | Вспомогательный |
| docs/dev/removed-unused-functions-report.md | Отчёт об удалении неиспользуемых функций и обновлении docs | dev | Вспомогательный |

Проверка по запросу:

- **Явный source of truth по deploy/infrastructure:** да. `.cursor/rules/deploy.mdc` (alwaysApply) — общий принцип; детали: PLAN_MEAL_PLANS_DEPLOY.md, share_og_setup.md.
- **Явный source of truth по engineering rules:** нет. Отдельного документа «правила кода / конвенции / код-стайл» нет.
- **Явный source of truth по database schema:** да. docs/database/DATABASE_SCHEMA.md.
- **Явный source of truth по project memory / operational context:** нет. Ближе всего dev-notes и разрозненные PR/планы в dev/; единого «память проекта / операционный контекст» нет.

---

## 3. Coverage by topic

| Тема | Статус | Чем покрыто | Пробелы / дублирование / риски |
|------|--------|-------------|-------------------------------|
| Проект и инфраструктура | Partially covered | docs/README.md (структура), deploy.mdc (деплой), share_og_setup, PLAN_MEAL_PLANS_DEPLOY | Нет одного «обзор проекта + стек + инфра»; агент собирает из нескольких мест. |
| Source of truth по docs | Partially covered | docs/README.md описывает папки и назначение | Не описано, какой документ главный при конфликте по одной теме (см. риски ниже). |
| Deployment truth | Covered well | deploy.mdc (alwaysApply), PLAN_MEAL_PLANS_DEPLOY, share_og_setup | Покрыто. |
| Database changes | Covered well | DATABASE_SCHEMA.md, FIX_SCHEMA_CACHE.md, миграции в supabase/migrations | Покрыто. |
| Supabase Edge architecture | Covered well | chat_recipe_generation.md, analytics-system (track-usage-event, deepseek-chat, generate-plan), unused-edge-functions | Покрыто; список функций синхронизирован после удаления (removed-unused-functions-report). |
| Output expectations / формат ответов агента | Missing | Нет отдельного документа | Нет явного «как агент должен отвечать / в каком формате / что не менять». Риск неоднозначности при запросах «сделай X». |
| Product constraints | Partially covered | Решения в decisions/, лимиты в analytics-system, chat_recipe_generation (Free/Premium, блокировки) | Размазано по многим файлам; единого «продуктовые ограничения» нет. |
| Project memory / operational context | Missing | dev-notes, отдельные PR/планы в dev/ | Нет одного места «что важно помнить при задачах» (например, фронт только через GitHub, не трогать миграции без плана и т.д.). |

---

## 4. Risks and ambiguities

- **Ссылки на старые пути (после реорганизации):**
  - В `docs/dev/PR_LUNCH_SOUP_AND_ASSIGN.md` указано: `docs/MEAL_TYPE_AND_LUNCH_SOUP.md`. Фактический путь: `docs/decisions/MEAL_TYPE_AND_LUNCH_SOUP.md`. Ссылка битая.
  - В `docs/decisions/recipe_prompt_sources_for_token_reduction.md` трижды указано: `docs/prompts_shortening_proposal.md`. Фактический путь: `docs/decisions/prompts_shortening_proposal.md`. Ссылки битые.

- **Упоминания удалённых audit/debug/diagnostic файлов:** В самих docs ссылок на файлы по шаблонам `audit*`, `debug*`, `diagnostic*` не найдено. В docs/README.md явно сказано, что такие документы были удалены; упоминания в других файлах — только про таблицу `subscription_plan_audit`, миграцию `ingredients_category_audit`, логи RECIPE_SAVE_PAYLOAD_DEBUG (это не пути к удалённым doc-файлам). Риск: кто-то может искать «audit» в docs и ожидать старые файлы — этого в тексте docs нет.

- **Неочевидность главного документа после реорганизации:**
  - По аллергиям/токенам: ALLERGIES_AND_PLAN_SOURCE_OF_TRUTH.md, ALLERGY_ALIASES.md, chat_recipe_generation.md (и код _shared/allergyAliases, blockedTokens). Не сказано явно, какой doc главный для «правил аллергенов».
  - По meal_type / обед/суп: MEAL_TYPE_AND_LUNCH_SOUP.md и chat_recipe_generation.md (domain/meal, пул). MEAL_TYPE — явный SoT для правил слота; chat_recipe_generation — для потока чата. Конфликта по смыслу нет, но приоритет не зафиксирован в одном месте.

- **Документы, которые могут конкурировать как SoT:**
  - Аллергии: ALLERGIES_AND_PLAN_SOURCE_OF_TRUTH vs ALLERGY_ALIASES vs фрагменты в chat_recipe_generation. Риск: агент возьмёт разные формулировки из разных файлов.
  - Деплой: deploy.mdc говорит «фронт только GitHub»; PLAN_MEAL_PLANS_DEPLOY и share_og_setup добавляют детали. Конкуренции нет, но «единого чек-листа деплоя» нет.

---

## 5. Safe next steps

Рекомендуется выполнять по одному, с проверкой после каждого шага.

1. **Исправить две битые ссылки** (без изменения содержания документов): в PR_LUNCH_SOUP_AND_ASSIGN.md заменить `docs/MEAL_TYPE_AND_LUNCH_SOUP.md` на `docs/decisions/MEAL_TYPE_AND_LUNCH_SOUP.md`; в recipe_prompt_sources_for_token_reduction.md заменить `docs/prompts_shortening_proposal.md` на `docs/decisions/prompts_shortening_proposal.md`.
2. **В docs/README.md** в разделе про decisions явно указать для спорных тем приоритет: например, «по аллергиям и плану — ALLERGIES_AND_PLAN_SOURCE_OF_TRUTH.md и ALLERGY_ALIASES.md; по meal_type и слоту обед — MEAL_TYPE_AND_LUNCH_SOUP.md», чтобы агент не выбирал между документами произвольно.
3. **Добавить одну фразу в docs/README.md** (или в deploy.mdc), что «главный источник по деплою фронта — правило deploy.mdc (только GitHub)», и что детали по конкретным фичам — в PLAN_MEAL_PLANS_DEPLOY и share_og_setup.
4. **Не делать без отдельного плана:** массовую реорганизацию docs; переименование или слияние канонических SoT (CHAT_HISTORY_SOURCE_OF_TRUTH, DATABASE_SCHEMA, chat_recipe_generation, MEAL_TYPE_AND_LUNCH_SOUP, ALLERGIES_AND_PLAN_SOURCE_OF_TRUTH); создание новых правил в .cursor/rules до фиксации приоритетов документов.
5. **Опционально (после п.1–3):** завести один короткий документ «output expectations» или «agent instructions» (например в docs/dev/) с пунктами: не менять код без явного запроса, не деплоить фронт через Netlify CLI, не менять существующие docs в рамках других задач — только если пользователь явно просит. Не переписывать SoT-документы.

---

## 6. Files reviewed

- .cursor/rules/deploy.mdc
- docs/README.md
- docs/architecture/CHAT_HISTORY_SOURCE_OF_TRUTH.md
- docs/architecture/chat_recipe_generation.md
- docs/architecture/recipe_save_flow_chat.md
- docs/architecture/share_og_setup.md
- docs/architecture/welcome_prelogin_routing.md
- docs/analytics/analytics-system.md
- docs/analytics/ad-views-chat-free-users.md (по списку; содержимое не цитировалось детально)
- docs/database/DATABASE_SCHEMA.md
- docs/database/FIX_SCHEMA_CACHE.md
- docs/decisions/MEAL_TYPE_AND_LUNCH_SOUP.md
- docs/decisions/ALLERGIES_AND_PLAN_SOURCE_OF_TRUTH.md
- docs/decisions/recipe_prompt_sources_for_token_reduction.md (фрагменты)
- docs/decisions/INGREDIENT_CATEGORY_NORMALIZATION.md (фрагменты)
- docs/dev/dev-notes.md
- docs/dev/PLAN_MEAL_PLANS_DEPLOY.md
- docs/dev/PR_LUNCH_SOUP_AND_ASSIGN.md
- docs/dev/unused-edge-functions.md
- docs/dev/removed-unused-functions-report.md
- docs/dev/POOL_AND_CHAT_RECIPES.md (упоминание debug)
- docs/dev/deepseek-chat_refactor_report.md (упоминание DEBUG)
- Остальные файлы в docs/ учтены по списку из Glob (decisions: PAYMENT_*, PREFERENCES_*, ALLERGY_ALIASES, prompts_shortening_proposal; dev: PHASE3_TWEAKS, RECIPES_CLEANUP, CHAT_BLOCKED_BEHAVIOR, PR_*).

---

## 7. Final verdict

- **Пригодность для повседневной работы:** достаточная. Один всегда применяемый rule по деплою и чёткая структура docs с каноническими документами по чату, БД, аналитике и ключевым решениям позволяют агенту и разработчику находить контекст. Ограничения: нет явного «память проекта» и «формат ответов агента»; при спорах между документами (аллергии, meal_type) приоритет не зафиксирован.
- **Самое рискованное место:** менять или объединять канонические source-of-truth документы (CHAT_HISTORY_SOURCE_OF_TRUTH, DATABASE_SCHEMA, chat_recipe_generation, MEAL_TYPE_AND_LUNCH_SOUP, ALLERGIES_AND_PLAN_SOURCE_OF_TRUTH) без отдельного плана и проверки ссылок.
- **Самые безопасные следующие шаги (рекомендация без выполнения):** (1) исправить две битые ссылки в PR_LUNCH_SOUP и recipe_prompt_sources; (2) в README зафиксировать приоритет документов по аллергиям и meal_type; (3) одной фразой закрепить deploy.mdc как главный источник по деплою фронта. Далее по желанию — короткий «output expectations» для агента.
- **Категорически не менять вслепую:** существующие docs (кроме точечного исправления путей по п.1); .cursor/rules; не создавать новые rules и не переписывать SoT-документы в рамках этого аудита.
