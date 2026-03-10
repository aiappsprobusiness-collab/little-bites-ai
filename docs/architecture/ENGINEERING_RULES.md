# Engineering rules

Краткий документ с инженерными правилами проекта.

---

## Project stack

- **Project:** Mom Recipes / Little Bites AI
- **Backend:** Supabase
- **Frontend deploy:** GitHub Pages (commit + push). Netlify не используется.
- Следовать существующей архитектуре проекта.

---

## Deployment

- **Supabase (Edge Functions):** через CLI (например `npm run supabase:deploy:chat`). Коммит/пуш для бэка не нужен.
- **Фронт:** только через GitHub — коммит и пуш. Не использовать Netlify CLI, не деплоить фронт вручную другими средствами. После push деплой идёт автоматически.

---

## Database rules

- Любые изменения БД — **только через** `supabase/migrations/`.
- Перед изменением читать: **docs/database/DATABASE_SCHEMA.md**
- Нельзя: менять схему вручную; писать SQL вне миграций.

---

## Edge functions rules

- Edge functions в **supabase/functions/**.
- **index.ts** — thin entrypoint.
- Бизнес-логика выносится в модули.

---

## Source-of-truth docs

Эти документы — источники истины по своим темам. Не переписывать без отдельного плана.

- docs/architecture/CHAT_HISTORY_SOURCE_OF_TRUTH.md
- docs/architecture/chat_recipe_generation.md
- docs/database/DATABASE_SCHEMA.md
- docs/decisions/MEAL_TYPE_AND_LUNCH_SOUP.md
- docs/decisions/ALLERGIES_AND_PLAN_SOURCE_OF_TRUTH.md

---

## Documentation policy

- Основная документация в **docs/**.
- Структура: `docs/architecture`, `docs/analytics`, `docs/database`, `docs/decisions`, `docs/dev`.
- Source-of-truth документы (см. выше) нельзя переписывать без отдельного плана.
