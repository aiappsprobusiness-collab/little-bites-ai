# Pre-task checklist

Перед тем как предлагать изменения кода, агент должен пройти этот чек-лист.

---

## 1. Understand project context

Прочитать:

- .cursor/context.md
- docs/PROJECT_CONTEXT.md

---

## 2. Check source-of-truth documents

Если задача связана с архитектурой или логикой приложения, проверить:

- docs/architecture/CHAT_HISTORY_SOURCE_OF_TRUTH.md
- docs/architecture/chat_recipe_generation.md

---

## 3. Check database schema

Если задача связана с данными или SQL — прочитать:

- docs/database/DATABASE_SCHEMA.md

---

## 4. Follow project rules

Учитывать правила в **.cursor/rules/**

---

## 5. Canonical docs and this task

- **Which canonical docs are affected by this task?** (Use mapping in docs/PROJECT_CONTEXT.md.)
- **Read the affected canonical docs before implementation.**
- **Does this task change DB schema?** If yes — create a migration in `supabase/migrations/`.
- **Does this task change behavior described in a canonical doc?** If yes — update that canonical doc before closing the task.

---

## 6. Prefer minimal changes

Агент должен:

- делать минимальные изменения
- избегать массовых рефакторингов
- следовать существующим паттернам

---

## 7. Avoid incorrect assumptions

Агент не должен предполагать:

- использование Netlify
- использование Firebase
- другую инфраструктуру

Проект использует: **Supabase + GitHub Pages**
