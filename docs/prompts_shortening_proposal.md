# Предложение по сокращению системного промпта (FREE/PREMIUM recipe)

**Цель:** уменьшить число входных токенов без потери критичных правил, чтобы ускорить ответ модели.

---

## 1. Текущая структура шаблонов

Оба шаблона (FREE и PREMIUM) собираются так:

- **STRICT_RULES** (~15 строк) — аллергии/предпочтения, «всегда один JSON», не отказ
- **SAFETY_RULES** (~5 строк) — аллергии, возраст &lt;12 мес, стиль
- **[ROLE]** — одна строка (Free vs Premium)
- **[CONTEXT]** — подстановки {{target_profile}}, {{ageRule}}, {{familyContext}}, allergies, preferences, mealType, maxCookingTime, servings, recentTitleKeysLine
- **[ЗАПРЕЩЕНО В ТЕКСТЕ]** — toddler/infant/возраст только числом
- **RULES_USER_INTENT** (~7 строк) — блюдо по запросу, mealType, только JSON
- **[RECIPE TASK]** — блок из 5 под-блоков:
  - RECIPE_STRICT_JSON_CONTRACT (~15 строк) — схема JSON + описание/ingredients/nutrition
  - RECIPE_JSON_RULES (~5 строк) — один рецепт, generic description/chefAdvice, amount у ингредиентов
  - RECIPE_DESCRIPTION_VARIETY_RULE (~5 строк) — 2–4 предложения, не обрывать на и/или, разнообразие зачинов
  - RECIPE_OUTPUT_RULES (~5 строк) — не упоминать семью, без reasoning/markdown/текста
  - RECIPE_ONE_ONLY_RULE (~5 строк) — ровно один рецепт, не списки, без текста вне JSON
- Одна финальная строка: про ингредиенты/шаги (макс. 5 vs 7) и при необходимости chefAdvice

**Различие FREE vs PREMIUM:** только строка ROLE и последняя строка (макс. шагов 5 vs 7, chefAdvice 300 символов).

---

## 2. Дублирование (что повторяется)

| Что повторяется | Где |
|-----------------|-----|
| «Только валидный JSON, без markdown и текста до/после» | RULES_USER_INTENT, RECIPE_STRICT_JSON_CONTRACT, RECIPE_JSON_RULES, RECIPE_ONE_ONLY_RULE |
| «Один рецепт / не списки» | RECIPE_JSON_RULES, RECIPE_ONE_ONLY_RULE |
| «description 2–4 предложения, не обрывать на и/или/...» | RECIPE_STRICT_JSON_CONTRACT (в схеме и ниже), RECIPE_DESCRIPTION_VARIETY_RULE |
| «ingredients с amount и единицей» | RECIPE_STRICT_JSON_CONTRACT, RECIPE_JSON_RULES, финальная строка шаблона |
| «Аллергии — запрет / замены» | STRICT_RULES, SAFETY_RULES |
| «Never output explanation / I cannot» | STRICT_RULES (CRITICAL), RECIPE_STRICT_JSON_CONTRACT |
| «No markdown, no extra text» | RECIPE_STRICT_JSON_CONTRACT, RECIPE_OUTPUT_RULES, RECIPE_ONE_ONLY_RULE |

---

## 3. Предлагаемая альтернатива (сокращённые блоки)

Ниже — **вариант текста**, который можно ввести как новые константы (или заменить текущие). Имена условные.

### 3.1. STRICT_RULES (коротко)

```
Allergies and preferences: STRICT. Allergies = never use; preferences (не любит/вегетарианское/без молочного и т.д.) = never use. Always output exactly one valid recipe JSON; if dish conflicts with constraints, replace ingredient and still output JSON. No refusal, no explanation, no text outside JSON.
```

(Сокращение: убрать детальный список интерпретаций и дубли с SAFETY_RULES; одну фразу про «plant-based» можно выкинуть или оставить одной строкой.)

### 3.2. SAFETY_RULES (коротко)

```
Age <12 мес: no salt, sugar, honey, whole milk. Style: expert, concise.
```

(Аллергии уже в STRICT_RULES; «предлагай замены» можно оставить одной фразой в STRICT_RULES.)

### 3.3. RULES_USER_INTENT (коротко)

```
Dish must match request. mealType must not change dish type. Output ONLY valid JSON, no markdown.
```

### 3.4. Один объединённый блок RECIPE_TASK вместо пяти

Вместо RECIPE_STRICT_JSON_CONTRACT + RECIPE_JSON_RULES + RECIPE_DESCRIPTION_VARIETY_RULE + RECIPE_OUTPUT_RULES + RECIPE_ONE_ONLY_RULE — один блок:

```
[RECIPE TASK]
One JSON object only. No markdown, no text before/after.
Schema: title, description (2–4 full sentences; do not end with "и"/"или"/"..."), ingredients [{name, amount}] max 10, steps (5–7, max 150 chars each), cookingTime, mealType, servings, chefAdvice (optional), nutrition (required; kcal 30–900, protein/fat/carbs, is_estimate: true).
description/chefAdvice: only about the dish (taste, texture, tips). No age, children, meal time in text. Every ingredient with amount+unit (г, мл, шт., ст.л., ч.л.). One recipe only, no lists.
```

Так убираются повторения про «один рецепт», «только JSON», «2–4 предложения», «amount у каждого», «без markdown».

### 3.5. Шаблон целиком (сокращённый скелет)

**FREE:**

```
${STRICT_RULES_SHORT}
${SAFETY_RULES_SHORT}

[ROLE] Ты — ИИ Mom Recipes (Free). Выдай 1 рецепт.

[CONTEXT]
Профиль: {{target_profile}}. {{ageRule}} ВОЗРАСТ_МЕСЯЦЕВ: {{ageMonths}}.
{{familyContext}}
Аллергии: {{allergies}}. Предпочтения: {{preferences}}.
Тип приёма: {{mealType}}. Макс. время готовки: {{maxCookingTime}}. Порций: {{servings}}.
{{recentTitleKeysLine}}

[ЗАПРЕЩЕНО В ТЕКСТЕ] toddler, тоддлер, infant, preschool. Возраст только числом.

${RULES_USER_INTENT_SHORT}

${RECIPE_TASK_SHORT}

ШАГИ: макс. 5.
```

**PREMIUM:** то же, но ROLE: «Шеф-нутрициолог Mom Recipes (Premium)» и последняя строка: «ШАГИ: макс. 7. chefAdvice: макс. 300 символов.»

---

## 4. Оценка сокращения

- **Сейчас:** STRICT_RULES + SAFETY_RULES + RULES_USER_INTENT + пять под-блоков RECIPE TASK дают порядка 50+ строк повторяющегося/пересекающегося текста только на правила.
- **После:** один короткий STRICT, короткий SAFETY, короткий USER_INTENT, один RECIPE_TASK — ориентировочно **в 2–2.5 раза меньше** текста в блоке правил при сохранении:
  - аллергии/предпочтения и «всегда один JSON»;
  - схемы полей и требований к description/ingredients/nutrition;
  - запрета текста вне JSON и отказов.

**Риски:** если модель сильнее опирается на развёрнутые примеры (не любит X → never use), можно оставить в STRICT одну строку с 2–3 примерами вместо полного списка.

---

## 5. Рекомендуемый порядок внедрения

1. Ввести **новые** константы (например `STRICT_RULES_SHORT`, `SAFETY_RULES_SHORT`, `RULES_USER_INTENT_SHORT`, `RECIPE_TASK_SHORT`) рядом с текущими.
2. Переключить FREE_RECIPE_TEMPLATE и PREMIUM_RECIPE_TEMPLATE на короткие версии.
3. Прогнать несколько запросов (с аллергиями, семейный режим, общий запрос) и сравнить качество и длину ответа.
4. Если всё ок — удалить старые длинные константы; при необходимости подправить одну-две фразы в коротких блоках.

Файл `prompts.ts` пока не менялся — это только предложение и вариант формулировок.
