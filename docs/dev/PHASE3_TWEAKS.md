# Phase 3: Калибровка правил после прогона harness

После запуска `node scripts/plan-quality-harness.mjs --member <uuid> ...` и просмотра метрик:

## A) AI слишком часто (низкий poolFillRate)

- **Ослабить penalties:** в `scorePoolCandidate` снизить `-5` → `-3` для breakfastLike на lunch/dinner, или `-8` → `-6` для fish/dairy proteinKey
- **Разрешить универсальные рецепты:** если `meal_type` в БД NULL — пока backfill не завершён, можно временно не фильтровать по meal_type строго (рискованно)
- **Расширить top-N:** `top10` → `top15` для большего случайного выбора

## B) Странные блюда пролезают (sanityViolationsCount > 0)

- **Добавить токены** в `slotSanityReject`:
  - breakfast: добавить "солянка", "карри" (если нет)
  - lunch: "оладьи", "сырники" (варианты написания)
  - dinner: "дольки", "фрукты" (snackOnly)
  - snack: "каша", "гречка", "рис" (grainHeavy)
- **Усилить dinner:** расширить snackOnly — "пудинг", "желе", "мороженое"
- **Усилить snack:** добавить "овощи с тофу" если попадает main-dish-like

## C) Молочка проскакивает (allergyViolationsCount > 0)

- **Расширить DAIRY_ALLERGY_TOKENS:** "сливочное", "сливочный", "сыворотка", "whey"
- **Проверять recipe_steps** в `passesProfileFilter` (instruction text)
- **Проверять tags** — уже есть

## D) Разнообразие

- **Слишком однообразно:** увеличить randomness — `top10` → `top15`, снизить titleKey penalty `-15` → `-10`
- **Слишком повторяется proteinKey:** повысить penalty fish/dairy с `-8` до `-10`, лимит с 1 до 0 (полный запрет повтора)
- **titleKey дубли:** увеличить penalty `-15` → `-20`

---

Текущие Phase 3 изменения (уже внесённые):
- Добавлен токен "сливочн" в DAIRY_ALLERGY_TOKENS
