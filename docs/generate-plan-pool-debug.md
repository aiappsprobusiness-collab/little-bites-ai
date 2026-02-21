# Почему слот (обед / день / неделя) не заполняется из пула

Пул рецептов берётся из таблицы **`public.recipes`**. Рецепт попадает в подбор только если проходит все фильтры ниже.

## 1. Кто попадает в пул (fetchPoolCandidates)

- **user_id** = текущий пользователь  
- **source** — только: `seed`, `starter`, `manual`, `week_ai`, `chat_ai`  
  - Если у рецепта другой `source` (например `favorite` или пусто) — он **не грузится** в пул  
- **member_id**:
  - Профиль **«Семья»**: в пул попадают только рецепты с `member_id IS NULL`
  - Профиль **ребёнка**: рецепты с `member_id = <id>` или `member_id IS NULL`

**Проверка в БД:**
```sql
SELECT id, title, source, member_id, meal_type
FROM recipes
WHERE user_id = '<ваш user_id>'
  AND source IN ('seed','starter','manual','week_ai','chat_ai')
  AND (member_id IS NULL OR member_id = '<member_id при выборе ребёнка>')
ORDER BY created_at DESC
LIMIT 120;
```

## 2. Обед = только супы

Для слота **lunch** в расчёт попадают только рецепты, у которых:

- в БД **meal_type** нормализуется в `lunch`, **или**
- по названию/описанию/ингредиентам выводится **lunch** — сейчас это только при наличии одного из токенов: **суп, борщ, щи, солянка, soup**

То есть для обеда нужны рецепты-супы (или с явным `meal_type = lunch` в БД). Рагу, плов, паста и т.п. считаются «ужин» и в слот обеда не подставляются.

**Проверка:** есть ли в пуле хотя бы один суп (или с `meal_type = lunch`)?

## 3. Дальнейшие фильтры (pickFromPool)

После отбора по слоту (meal_type) рецепты дополнительно фильтруются по:

- **excludeRecipeIds** — уже использованные в плане рецепты  
- **excludeTitleKeys** — уже использованные блюда (нормализованное название)  
- **excludedMainIngredients** — главный ингредиент уже использован в этот день  
- **sanity** — по слоту (для lunch отсекаются «завтраковые» токены: сырник, оладьи, запеканка, каша, гранола, тост)  
- **аллергии/профиль** — по профилю ребёнка/семьи  

Если после всех шагов кандидатов 0, слот остаётся пустым.

## 4. Как увидеть причину в логах Edge

Включи в запросе **debug_plan: true** (или тумблер «Debug план» в UI). В логах Edge Function появятся записи **[POOL DIAG counts]** для каждого слота, например:

```json
{
  "mealKey": "lunch",
  "counts": {
    "fromDb": 45,
    "afterExcludeIds": 44,
    "afterTitleKeys": 40,
    "afterMainIngredient": 40,
    "afterMealType": 0,
    "afterSanity": 0,
    "afterAllergies": 0,
    "final": 0
  },
  "rejectReason": "meal_type_mismatch"
}
```

Что смотреть:

- **fromDb** — сколько рецептов вообще загрузилось в пул для этого вызова  
- **afterMealType** — сколько осталось после отбора по типу приёма (для lunch — только супы)  
  - `afterMealType: 0` при ненулевом `fromDb` → **rejectReason: "meal_type_mismatch"** — в пуле нет подходящих супов/обедов  
- **rejectReason** — итоговая причина:  
  - `no_candidates` — пул не загрузился (user_id/source/member_id)  
  - `member_id_mismatch` — для семьи пул с `member_id IS NULL` пуст  
  - `meal_type_mismatch` — нет рецептов с типом «обед» (супы)  
  - `sanity_rules` — все отсечены санity-правилами  
  - `filtered_by_allergies` и т.п. — профиль/аллергии  

## 5. Краткий чеклист «Обед пустой»

1. В БД есть рецепты с `source IN ('seed','starter','manual','week_ai','chat_ai')` и нужным `member_id`?  
2. Среди них есть **супы** (в title/description есть суп, борщ, щи, солянка) или `meal_type = lunch`?  
3. В **[POOL DIAG counts]** для `mealKey: "lunch"`: какой **rejectReason** и на каком шаге обнуляется счётчик (afterMealType / afterSanity / afterAllergies)?

После этого будет ясно, не хватает супов в базе, они отфильтровались по source/member_id, или слот режется на этапе meal_type/sanity/profile.
