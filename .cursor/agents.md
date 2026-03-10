# Agent Behaviour

Поведение AI-агента при работе с проектом: сначала читать документацию, избегать неверных предположений, делать минимальные изменения.

---

## 1. Read context first

Перед внесением изменений агент должен сначала изучить:

- **.cursor/context.md**

и затем ключевые документы:

- docs/PROJECT_CONTEXT.md
- docs/database/DATABASE_SCHEMA.md
- docs/architecture/CHAT_HISTORY_SOURCE_OF_TRUTH.md
- docs/architecture/chat_recipe_generation.md

---

## 2. Prefer existing patterns

Перед созданием новых решений агент должен:

- проверить существующие паттерны
- следовать текущей архитектуре проекта
- не вводить новые абстракции без необходимости

---

## 3. Avoid unnecessary refactors

Агент не должен:

- переписывать существующие файлы без запроса
- проводить массовый рефакторинг
- менять структуру проекта

---

## 4. Respect source-of-truth documents

Следующие документы считаются каноническими:

- docs/architecture/CHAT_HISTORY_SOURCE_OF_TRUTH.md
- docs/architecture/chat_recipe_generation.md
- docs/database/DATABASE_SCHEMA.md
- docs/decisions/MEAL_TYPE_AND_LUNCH_SOUP.md
- docs/decisions/ALLERGIES_AND_PLAN_SOURCE_OF_TRUTH.md

Эти документы нельзя переписывать без явного запроса.

**Keep canonical docs in sync:** Before making changes, identify whether the task affects any canonical docs. If yes, update the impacted canonical docs in the same task. Do not rewrite unrelated docs.

---

## 5. Task workflow (default behaviour)

**Before implementation:**
- Identify which canonical docs are affected by this task.
- Read the affected canonical docs before making changes.

**During implementation:**
- Change only relevant code / SQL / edge functions.
- If DB schema changes — create a migration in `supabase/migrations/`.
- If the change touches a domain described in a canonical doc — update that canonical doc in the same task.
- Do not change unrelated docs; do not rewrite unrelated source-of-truth documents.

**After implementation (always include in the response):**
- List changed files.
- State which canonical docs were updated (if any); if none, briefly state why.
- If a migration was created — state the migration file path.
- List apply/deploy steps: migrations (`supabase db push` or equivalent), edge functions deploy, frontend deploy (GitHub push), env changes if needed.

---

## 6. Safe modification policy

Предпочтение отдаётся:

- точечным изменениям
- минимальному diff
- сохранению существующей архитектуры

---

## 7. Infrastructure assumptions

Агент должен помнить:

| | |
|---|---|
| **Frontend deploy** | GitHub Pages / GitHub Actions |
| **Backend** | Supabase |
| **Edge functions** | Supabase Edge Functions |

Netlify не используется.
