# Порции в карточке рецепта из Плана — persistence (март 2026)

## Root cause

1. **Источник истины для выбранных порций из плана** уже задан: поле **`meals.<meal_type>.servings`** в строке **`meal_plans_v2`** (не колонки рецепта). Мутация **`updateSlotServings`** пишет только этот JSON-слот; **`servings_base` / `servings_recommended`** и строки рецепта в БД не меняются.

2. **Сброс при повторном открытии** возникал, когда значение **не доходило до БД** или **кэш React Query оставался с `servings: undefined`**: UI показывал пересчёт по локальному `servingsSelected`, а при следующем монтировании карточка снова брала дефолт из рецепта (часто **1**).

3. **Конкретный баг в эффекте сохранения на `RecipePage`**: при **`slotServings === servingsSelected`** эффект делал **ранний `return` без функции cleanup**. После успешного debounce-сохранения кэш патчился → слот и UI совпадали → последний запуск эффекта **не регистрировал cleanup**. При **закрытии карточки до истечения 400 ms** debounce предыдущий cleanup уже мог отработать на **устаревшем замыкании** (`servingsSelected` / `slotServings` не те), а **финальный flush при unmount отсутствовал** — запись в Supabase не вызывалась.

## Назначение из чата / «Добавить в план» и кэш

1. После успешного **`assign_recipe_to_plan_slot`** кэш React Query для плана нужно сбрасывать по префиксу **`['meal_plans_v2', userId]`** с **`refetchType: 'all'`**, чтобы подтянулись и **inactive**-запросы (план не смонтирован, пользователь в чате). Узкая инвалидация только по predicate и дате могла не совпасть со всеми вариантами ключа (неделя vs день, `mutedWeekKey`, разный `member_id`).

2. **Free + «Семья» в листе:** в RPC уходит **`member_id` первого ребёнка**, как на `MealPlanPage` (`mealPlanMemberId` для Free family). Раньше при выборе «Семья» передавался **`null`** (как у Premium), а план читал **строку ребёнка** — в UI оставался старый слот до полного перезагрузки.

## Где хранится выбранное число порций

- **Персистентно:** `meal_plans_v2.meals[breakfast|lunch|snack|dinner].servings` для строки с **`user_id` + `planned_date` + `member_id`** (для «Семья» Premium — `member_id IS NULL`).

## Ключ / идентификация слота

Логический ключ слота (как в UI и запросах):

- **`planned_date`** (день),
- **`member_id`** строки плана (`null` = семейная строка),
- **`meal_type`** (слот приёма),
- **`recipe_id`** (совпадение с `id` из маршрута на `RecipePage`).

Навигация с Плана передаёт в `location.state`: `fromMealPlan`, `plannedDate`, `mealType`, опционально `memberId` (см. `MealCard`).

## Инициализация карточки

1. Если открытие **из плана** и в кэше/данных слота есть **`servings ≥ 1`** → **`servingsSelected`** = значение слота (до загрузки полного объекта рецепта, опираясь на `id` из URL).
2. Если слот в плане уже найден (`planSlotResolved`), но в JSON слота **нет** `meals.*.servings` → дефолт **`servings_base`** (канон для ингредиентов), **не** `servings_recommended` (часто 4): иначе при появлении позднего `servings` из плана (часто 1) возникало мигание **4↔1**.
3. Карточка **не из плана** (каталог / чат и т.д.): как раньше — **`servings_base` / `servings_recommended`** (`base ≥ 4` → base, иначе recommended), но **один раз на экран** (`servingsViewKey`); повторный fetch рецепта не перезаписывает порции; ручной степпер ± защищён ref-флагом.

Пересчёт ингредиентов: **`servingMultiplier = servingsSelected / servings_base`** от **канонической базы** рецепта; для плана дополнительно **`applyIngredientOverrides`** с подстановками слота (`RecipePage`).

## Изменённые файлы

- `src/pages/RecipePage.tsx` — refs для актуальных значений; эффект сохранения **всегда** возвращает cleanup при контексте плана; debounce и flush по refs; таймер вызывает `updateSlotServings` тоже по refs.
- `src/hooks/useMealPlans.tsx` — в **`updateSlotServings.onSuccess`**: узкая **`invalidateQueries({ predicate })`** по дате (в дополнение к патчу кэша и `plan_signature`).
- `src/hooks/useAssignRecipeToPlanSlot.ts` — после assign: инвалидация **`['meal_plans_v2', userId]`** + `refetchType: 'all'`.
- `src/components/plan/AddToPlanSheet.tsx` — выравнивание **`member_id`** для Free «Семья» с `MealPlanPage`.
- `docs/architecture/shopping_list_product_model.md` — актуализирован абзац про порции и пункт ручной проверки.
- `docs/dev/plan-recipe-servings-persistence-2026-03.md` — этот документ.

## Что проверить руками

1. План → блюдо → карточка → **1 → 3** → **сразу** назад на план (< 400 ms) → снова та же карточка: **3**, ингредиенты как для 3 порций.
2. То же с ожиданием > 400 ms перед закрытием.
3. Premium «Семья» и отдельный ребёнок — порции не должны путаться между строками плана.
4. Карточка **не** из плана (без `fromMealPlan`): поведение порций как раньше (без записи в `meal_plans_v2`).

## Сознательно не трогалось

- Схема БД, RPC, Edge Functions.
- Канонические поля рецепта и строки `recipe_ingredients`.
- Глобальный стор / «последнее число порций на recipeId» без контекста слота.
- `recipePlanMutedWeekKey` на `RecipePage` (по-прежнему чтение из storage при монтировании; при расхождении с Планом см. существующие правила в `shopping_list_product_model.md`).
