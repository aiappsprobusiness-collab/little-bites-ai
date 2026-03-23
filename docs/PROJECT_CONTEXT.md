# Project Context

Краткий high-signal контекст проекта для разработчиков и AI-агентов. Не source-of-truth по архитектуре — обзор того, что важно помнить при работе.

---

## Project

**Mom Recipes / Little Bites AI**

Приложение для:
- генерации рецептов
- планирования питания
- семейных профилей
- AI-чата для рецептов

---

## Stack

| | |
|---|---|
| **Frontend** | React |
| **Backend / Database** | Supabase |
| **Edge functions** | Supabase Edge Functions |

---

## Deployment

- **Frontend deploy:** GitHub Pages / GitHub Actions. Netlify не используется.
- **Edge functions:** деплоятся отдельно через Supabase CLI.

---

## Documentation structure

| Папка | Назначение |
|-------|------------|
| docs/architecture | архитектурные документы |
| docs/analytics | аналитика |
| docs/database | схема БД |
| docs/decisions | важные решения |
| docs/dev | dev-заметки и отчёты |

---

## High-signal source-of-truth docs

- docs/architecture/CHAT_HISTORY_SOURCE_OF_TRUTH.md
- docs/architecture/chat_recipe_generation.md
- docs/database/DATABASE_SCHEMA.md
- docs/decisions/MEAL_TYPE_AND_LUNCH_SOUP.md
- docs/decisions/ALLERGIES_AND_PLAN_SOURCE_OF_TRUTH.md

**UI чата (поле ввода, клавиатура, авто-рост):** docs/dev/chat-input-ui.md — не путать с хранением истории (`CHAT_HISTORY_SOURCE_OF_TRUTH.md`).

Эти документы считаются каноническими. Их нельзя переписывать или объединять без отдельного плана.

**Canonical docs must stay synchronized with implementation.** When changing a covered domain, update the matching canonical docs in the same task.

---

## Canonical doc mapping (which doc to update)

| Domain | Canonical doc |
|--------|----------------|
| DB schema / RLS / RPC / relationships | docs/database/DATABASE_SCHEMA.md |
| Chat history storage / source-of-truth / read-write flow | docs/architecture/CHAT_HISTORY_SOURCE_OF_TRUTH.md |
| Recipe generation flow / filters / age rules / constraints | docs/architecture/chat_recipe_generation.md |
| meal_type / lunch / soup / assign slot logic | docs/decisions/MEAL_TYPE_AND_LUNCH_SOUP.md |
| Allergies / dislikes / plan filtering / family restrictions | docs/decisions/ALLERGIES_AND_PLAN_SOURCE_OF_TRUTH.md |

---

## Safe modification rules

- не переписывать source-of-truth документы без отдельного запроса
- не делать массовую реорганизацию docs
- сначала проверять существующие docs и архитектурные решения
- предпочтительны точечные изменения

---

## Development guardrails

- изменения БД — только через миграции
- перед изменениями смотреть docs/database/DATABASE_SCHEMA.md
- в Supabase Edge Functions не раздувать index.ts; нетривиальную логику выносить в модули
- frontend deploy — через GitHub

---

## Product guardrails

- не путать free / premium / trial
- учитывать family mode
- учитывать аллергии и dislikes/likes
- следовать decision-документам
