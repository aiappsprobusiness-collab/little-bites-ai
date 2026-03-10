# Cursor Context

Короткий runtime context для Cursor. Не делать неверных предположений о проекте.

---

## Project

**Mom Recipes / Little Bites AI**

Приложение для:
- генерации рецептов
- планирования питания
- семейных профилей
- AI-чата рецептов

---

## Stack

| | |
|---|---|
| **Frontend** | React |
| **Backend / Database** | Supabase |
| **Edge functions** | Supabase Edge Functions |

---

## Deployment truth

- **Frontend deploy:** GitHub Pages / GitHub Actions. Netlify не используется.
- **Edge functions:** деплоятся отдельно (Supabase CLI).

---

## Important docs

- docs/PROJECT_CONTEXT.md
- docs/database/DATABASE_SCHEMA.md
- docs/architecture/CHAT_HISTORY_SOURCE_OF_TRUTH.md
- docs/architecture/chat_recipe_generation.md

**Canonical doc mapping (which doc to update when):** DB/schema/RLS/RPC → DATABASE_SCHEMA.md. Chat history flow → CHAT_HISTORY_SOURCE_OF_TRUTH.md. Recipe generation / filters / age → chat_recipe_generation.md. meal_type / lunch / soup / assign → MEAL_TYPE_AND_LUNCH_SOUP.md. Allergies / dislikes / plan / family → ALLERGIES_AND_PLAN_SOURCE_OF_TRUTH.md. Full mapping: docs/PROJECT_CONTEXT.md § Canonical doc mapping.

---

## Guardrails

- не переписывать source-of-truth документы
- не менять структуру docs без запроса
- изменения БД только через миграции
- не раздувать index.ts в edge functions
- следовать существующим паттернам проекта

---

## Common mistakes to avoid

- не писать про Netlify как про текущий hosting
- не смешивать frontend deploy и Supabase deploy
- не придумывать новые архитектурные сущности без необходимости
