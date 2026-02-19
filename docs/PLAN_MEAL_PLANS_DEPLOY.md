# Деплой изменений: план на день (meal_plans_v2, UI)

После мержа PR с правками плана и пустого состояния:

## 1. Миграции БД

Если миграции ещё не применены:

```bash
npx supabase db push
```

Будут применены (если есть в очереди):

- `20260220000000_meal_plans_v2_unique_and_cleanup.sql` — cleanup дублей, partial unique indexes, RPC assign_recipe_to_plan_slot (upsert + merge)
- `20260220100000_assign_recipe_to_plan_slot_return_validate.sql` — RPC возвращает `id`, `meals`, проверка слота после merge

## 2. Edge Function generate-plan

```bash
npx supabase functions deploy generate-plan
```

## 3. Фронт (если менялись компоненты Plan UI)

По правилам проекта фронт деплоится **только через GitHub** (коммит + пуш). Netlify/CI подхватят сборку после push.

- После push в нужную ветку дождитесь завершения деплоя в панели Netlify (или вашего CI).

## Проверка

- **БД:** для одного `(user_id, member_id, planned_date)` всегда одна строка в `meal_plans_v2` (`rows_count = 1`).
- **Fill day/week:** после «Заполнить день» UI показывает блюда, empty state исчезает.
- **Add to plan:** после «добавлено» в `meals` появляется соответствующий слот.
- Кнопки генерации не дублируются: в hero — «Заполнить день», «Заполнить всю неделю», «Очистить»; в empty state — только «Заполнить день» и «Подобрать рецепт».
