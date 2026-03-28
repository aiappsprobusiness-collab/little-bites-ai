# Подбор рецептов для плана (день и неделя): профиль, аллергии, любит/не любит, семья

Документ описывает **всю логику**, которая влияет на то, какие рецепты попадают в меню на день и на неделю во вкладке **План**: откуда берётся профиль, как учитываются аллергии, «любит» и «не любит», возраст и режим «Семья».

**Связанные документы:**  
[ALLERGIES_AND_PLAN_SOURCE_OF_TRUTH.md](../decisions/ALLERGIES_AND_PLAN_SOURCE_OF_TRUTH.md), [MEAL_TYPE_AND_LUNCH_SOUP.md](../decisions/MEAL_TYPE_AND_LUNCH_SOUP.md), [family-nutrition-rules-map.md](./family-nutrition-rules-map.md).

---

## 1. Откуда берётся профиль при генерации плана

### 1.1 Кто передаёт данные

- **Клиент** (страница План, `MealPlanPage`) формирует `memberDataForPlan` и при вызовах Edge передаёт в теле запроса:
  - `member_id` — выбранный профиль или `null` для режима «Семья»;
  - `member_data` — объект с полями `allergies`, `likes`, `dislikes`, при одном профиле ещё `age_months`, `type` и `introduced_product_keys`, при семье — объединённые списки и `type: "family"`.

### 1.2 Формирование `memberDataForPlan` на клиенте

- **Режим «Семья»** (Premium/Trial, выбран «Семья»):
  - `allergies` = объединение всех `members[].allergies` (уникальные значения);
  - `likes` = объединение всех `members[].likes`;
  - `dislikes` = объединение всех `members[].dislikes`;
  - `type: "family"`, имя «Семья».  
  Возраст для плана в семейном режиме не используется (см. раздел 4).

- **Один профиль** (выбран конкретный член семьи или Free с одним профилем):
  - Берутся `allergies`, `likes`, `dislikes`, `age_months`, `type`, `introduced_product_keys` выбранного профиля.

Код: `MealPlanPage.tsx` (useMemo для `memberDataForPlan`), вызовы `runPoolUpgrade` / `startPlanGeneration` с `member_data: memberDataForPlan`.

### 1.3 Что делает Edge (generate-plan)

- В **run** и **upgrade** (и при **replace_slot**):
  - Если `member_id == null` (режим «Семья»): Edge сам подтягивает всех членов семьи из БД и вызывает `buildFamilyMemberDataForPlan(members)` → получает объединённые **`allergies`, `dislikes`, `preferences`** и **без возрастного фильтра** (`type: "adult"` по смыслу для пула). Поле **`likes` в подбор пула не входит** (см. раздел 4).
  - Если `member_id` задан: при необходимости Edge дополняет/перезаписывает `member_data` данными из `members` (**allergies, dislikes, age_months**) для актуальности. Колонку `likes` для generate-plan Edge **не читает**.

Итоговый объект профиля для фильтрации пула и скоринга — `effectiveMemberData` (run/upgrade) или `replaceMemberData` (replace_slot).

---

## 2. Аллергии

### 2.1 Правило

Аллергии — **жёсткий запрет**: рецепт, в котором встречается запрещённый токен (в названии, описании или ингредиентах), **не должен** попадать в план.

### 2.2 Где проверяется

- **Edge (generate-plan):**  
  В `pickFromPoolInMemory` кандидаты фильтруются через `passesProfileFilter` → `passesPreferenceFilters` (модуль `preferenceRules.ts`). Там для аллергий используются токены из `getBlockedTokensFromAllergies(memberData?.allergies)` (словарь из `_shared/allergyAliases.ts` + `allergens.ts`). Проверяется текст рецепта: **title, description, recipe_ingredients** (поля `name`, `display_text`). Поле `recipe_ingredients.category` не используется.

- **Клиент** (подбор из пула при «Подобрать рецепты», замена слота из пула, `useReplaceMealSlot`, `useGenerateWeeklyPlan` при pool):  
  В `recipePool.ts`: `passesProfileFilter` использует `containsAnyTokenForAllergy` (подстрока, без границы слова) и при наличии аллергий у профиля запрос к `recipes` **подгружает** `recipe_ingredients(name, display_text)`, так что проверка аллергий на клиенте выполняется по **title, description, tags и ингредиентам** — в одну сторону с Edge.

### 2.3 Токены и алиасы

- Набор «запрещённых» токенов строится из списка аллергий пользователя и словаря алиасов (БКМ, глютен, яйца, рыба, орехи, курица и т.д.). Примеры: БКМ → молоко, сливки, йогурт, сыр, творог, казеин и т.д.; «курица» → кур, куриц, chicken.  
- Для **аллергий** используется проверка по **подстроке** (без требования границы слова), чтобы формы вроде «орехами», «ореховый» блокировались токеном «орех».  
- **Ложный матч нут/nut:** нут (chickpea) не считается орехом: при токене «nut» текст, содержащий кириллическое «нут», не считается совпадением (явное исключение в `containsAnyTokenForAllergy` / `recipeMatchesAllergyTokens`).
- **Яйца:** отдельный токен «белок» для аллергии на яйца **не используется** (см. §4.1 в [ALLERGIES_AND_PLAN_SOURCE_OF_TRUTH.md](../decisions/ALLERGIES_AND_PLAN_SOURCE_OF_TRUTH.md)).

Подробнее: [ALLERGIES_AND_PLAN_SOURCE_OF_TRUTH.md](../decisions/ALLERGIES_AND_PLAN_SOURCE_OF_TRUTH.md), [family-nutrition-rules-map.md](./family-nutrition-rules-map.md).

---

## 3. «Не любит» (dislikes)

### 3.1 Правило

Dislikes — **жёсткое исключение**: рецепт, содержащий токен из списка «не любит», не попадает в план (аналогично аллергии по строгости).

### 3.2 Как строятся токены

- **Edge:** `preferenceRules.buildDislikeTokens(memberData)` — каждый пункт из `member_data.dislikes` нормализуется и разбивается на слова; для длинных слов (≥4 символа) добавляется вариант без последней буквы (stem). Проверка по тем же полям рецепта, что и для аллергий: title, description, recipe_ingredients (name, display_text).

- **Клиент:** `recipePool.getDislikeTokens(memberData)` — массив dislikes → токенизация (слова от 2 символов), как на Edge по входу. Проверка в `passesProfileFilter` идёт по **одному объединённому тексту** с **title, description, tags и ингредиентами** (`recipe_ingredients.name`, `display_text`), через `containsAnyToken` (граница слова). Если `dislikes` непусты, в SELECT пула подмешиваются строки ингредиентов (`memberHasDislikesForPool`), иначе фильтр не имел бы смысла.

### 3.3 Где применяется

- В плане (день/неделя): при выборе рецепта из пула (Edge `pickFromPoolInMemory`, клиент `pickRecipeFromPool`) кандидат отсекается, если в нём есть совпадение с токенами dislikes.  
- При замене слота (replace_slot на Edge, замена из пула на клиенте) используется тот же профиль и те же фильтры.

---

## 4. «Любит» (likes)

### 4.1 Правило для **недельного/дневного плана** (generate-plan)

**Likes не участвуют** в подборе рецептов из пула для плана: ни фильтрация, ни бонусы/штрафы в формуле ранжирования, ни режимы favor/avoid, ни ограничения «один like в день». В пуле остаются жёсткие **аллергии** и **dislikes**, скоринг по **целям** (`selected_goal`, дневное разнообразие), **возраст/семья/soft-mode**, **культурная familiarity**, **trust tier** и прочие сигналы, описанные в разделе 6.

Клиент по-прежнему может передавать `likes` в `member_data` (и в режиме семьи объединять их для UI/других сценариев), но Edge **generate-plan** эти значения для ранжирования **не использует**.

### 4.2 Где likes **остаются** мягким сигналом

Генерация рецепта **в чате** (deepseek-chat): строки про симпатии через `_shared/likesFavoring.ts` (`buildLikesLine`, `buildLikesLineForProfile`, `shouldFavorLikes`) и сборку системного промпта — **без изменений** в рамках этой политики. Подробнее: [system-prompts-map.md](./system-prompts-map.md).

### 4.3 Клиентский пул (подбор на устройстве)

- В `recipePool.pickRecipeFromPool` **нет** скоринга по likes: после фильтров (аллергии, dislikes, возраст, слот, sanity) из отфильтрованных кандидатов выбирается случайный из топ-N.

### 4.4 Документ PREFERENCES_BERRIES_RATIO (25%)

В [PREFERENCES_BERRIES_RATIO.md](../decisions/PREFERENCES_BERRIES_RATIO.md) описана историческая цель доли ягодных рецептов. Текущий **generate-plan** не реализует ни 25%-счётчик, ни прежнюю логику favor/avoid по likes; при необходимости новой доли её нужно проектировать отдельно.

---

## 4.5 Разнообразие недели по «основе» блюда (primary base)

При генерации **недели** (не одного дня) применяется контроль разнообразия по смысловой базе блюда:

- **Primary base** определяется rule-based по title + description + ingredients: творог, овсянка, йогурт/кефир, яйца, курица, индейка, рыба, гречка, рис, макароны, картофель, сыр, тофу, нут, фасоль и т.д. (модуль `_shared/primaryBase.ts`, `inferPrimaryBase`).
- В течение недели ведётся счётчик использований каждой базы (`usedBaseCounts`). После достижения лимита (**MAX_BASE_PER_WEEK**, по умолчанию 5) новые кандидаты с той же базой получают **штраф к скорингу** (diminishing priority), а не жёсткий запрет — при нехватке альтернатив рецепт с переиспользованной базой всё ещё может быть выбран.
- Штраф по базе не даёт одной основе забивать всю неделю (likes на это не влияют — см. раздел 4).

---

## 5. Возраст и семейный профиль: дети до 12 мес, 1–3 года, взрослые

### 5.1 Режим «Семья» (member_id = null)

- Для **плана** в семейном режиме возраст **не используется** для фильтрации пула:
  - `buildFamilyMemberDataForPlan` возвращает `type: "adult"` и не передаёт `age_months` в смысле «фильтровать по возрасту».
  - В `memberAgeContext`: при `type === "adult"` или `type === "family"` возвращается `applyFilter: false` — фильтры по возрасту рецепта и по ключевым словам (младенец/малыш) **не применяются**.

Итого: при выборе «Семья» в плане подставляются рецепты, подходящие «общему столу», без учёта возраста детей (до 12 мес, 1–3 года и т.д.) в логике пула. При этом **аллергии и dislikes всех членов семьи по-прежнему объединяются и применяются** (см. раздел 1).

**Stage 4.3 (generate-plan):** возраст из строк `members` не включает дополнительных **фильтров** пула в семейном режиме, но участвует в **скоринге** выбора рецепта (возрастные бонусы по `nutrition_goals`, soft-mode при наличии ребёнка младше 3 лет; младенцы &lt;12 мес не дают возрастного бонуса). Подробнее: `docs/refactor/recipe-core-multilang-progress.md` (Stage 4.3).

- Дополнительно для **ужина** в семейном режиме:
  - Сначала кандидаты фильтруются через `isFamilyDinnerCandidate`: исключаются рецепты с токенами вроде «стейк», «бифштекс», «ростбиф», «шашлык», «medium», «rare» (безопасность для малышей за общим столом).
  - Предпочтение отдаётся рецептам с «туш», «рагу», «котлет», «тефтел», «запеканк» и т.д. Если после этого фильтра остаётся слишком мало кандидатов (< MIN_FAMILY_DINNER), ужин подбирается из всего пула без семейного фильтра.

### 5.2 Один профиль с возрастом (не «Семья»)

Если выбран конкретный член семьи и передан `age_months` (и не передан тип adult/family):

- **memberAgeContext:** при `age_months < 18*12` (216) включается возрастной фильтр (`applyFilter: true`).
- **recipeFitsAgeRange:** рецепт отсекается, если у него заданы `min_age_months`/`max_age_months` и возраст члена не попадает в этот диапазон.
- **recipeBlockedByInfantKeywords:** рецепт отсекается по ключевым словам в title/description:
  - для **возраста &lt; 36 мес** — слова из списка «остро», «кофе», «грибы» (AGE_RESTRICTED);
  - для **возраста ≤ 12 мес** — дополнительно: «свинина», «говядина», «стейк», «жарен», «копчен», «колбас» (INFANT_FORBIDDEN_12);
  - для **возраста &lt; 24 мес** — дополнительно: «стейк», «жарен», «копчен», «колбас», «бекон», «отбивн» (TODDLER_UNDER_24_FORBIDDEN). Токены «кусоч», «котлет», «запеканк» намеренно **не** используются: они давали ложные срабатывания на фразы вроде «мягкие кусочки», «овощные котлетки», «творожная запеканка».

Для **взрослых** (age_months ≥ 216 или type adult/family): возрастной фильтр не применяется; дополнительно из пула могут исключаться рецепты с `max_age_months <= 12` (только для младенцев), чтобы не предлагать взрослым чисто младенческие варианты.

### 5.3 Младенцы &lt; 12 мес и «дети 1–3» в контексте плана

- В **чате** (deepseek-chat) при режиме «Семья» в промпт не включаются младенцы &lt; 12 мес, если есть хотя бы один член ≥ 12 мес (`getFamilyPromptMembers`); для членов 12–35 мес добавляется блок kid-safety (минимум соли/сахара, без фритюра/острого и т.д.). Это влияет на **генерацию рецептов в чате**, а не на подбор из пула в плане.
- В **плане** при выборе «Семья» возраст вообще не участвует в фильтрации (см. выше). При выборе одного ребёнка с age_months &lt; 12 или 12–35 применяются описанные выше ключевые слова и min/max_age_months.

### 5.4 Прикорм: один профиль ребёнка &lt; 12 мес (не «Семья»)

Если выбран **конкретный** профиль (`member_id` задан), тип не `adult` / `family`, и `age_months` задан и **&lt; 12**:

- **Edge (generate-plan)** в режиме run/upgrade **не заполняет четыре слота** завтрак/обед/полдник/ужин. Вместо этого подбираются **1 или 2 блюда** только из пула БД (как и для остального плана — без AI): слоты `breakfast` и при необходимости `lunch`; слоты `snack` и `dinner` **очищаются** (`null` в merge).
- **Количество блюд за день:** 4–6 мес → 1; 7–8 мес → 1 или 2 (детерминированно от `day_key` + `member_id`); 9–11 мес → чаще 2.
- **Фильтры:** те же, что для возрастного профиля — `recipeFitsAgeRange` (min/max_age_months), `recipeBlockedByInfantKeywords`, аллергии и dislikes через `passesPreferenceFilters`. Дополнительно кандидаты ограничиваются типами приёма **без ужина** (`resolved !== dinner`): младенческие пюре/каши часто помечены как breakfast/lunch/snack.
- **replace_slot (Edge):** для серверных сценариев — тот же «прикормовый» подбор (`pickInfantComplementaryFromPool`). **Экран плана** для прикорма (&lt;12 мес, Premium): замена ↻ на **клиенте** — `pickInfantNewRecipe` / `pickInfantFamiliarRecipe` + `replaceSlotWithRecipe` с явным **`infantSlotRole`**: `primary` = введение нового продукта, `secondary` = только введённые продукты; в **`meal_plans_v2`** по-прежнему используются технические id **`breakfast` / `lunch`** как носители строки плана (не смысл «завтрак/обед» в UI). Edge **`replace_slot`** для этого UI не вызывается. Слоты snack/dinner скрыты.
- **Ответ API:** `totalSlots` для upgrade считается как сумма ожидаемых блюд по дням (до 2 на день), а не `дни × 4`.

В infant-рецепт режиме (при `max_age_months < 12`) при открытии рецепта блок подсказки называется **«Подсказка для мамы»**, а текст `description` показывается как мягкий текст про текстуру/этап прикорма (без benefit-подписи).

**Клиент:** вкладка «План» — упрощённый экран: заголовок «План прикорма на сегодня», дата и блок подписки/меню — **верхняя строка**; ниже на **полную ширину карточки**: `MemberSelectorButton` (👶, `fitLabelWidth`), единый компактный **info-блок** (рамка `border-border/45`, мелкий шрифт): абзац про ГМ/смесь и постепенный прикорм 1–2 раза в день, строка «Подробнее о прикорме — в разделе ниже»; при **4–5 мес** (`infantAgeMonths` 4–5) внутри того же блока — заметное, но спокойное предупреждение **«В 4–5 месяцев прикорм вводят только по согласованию с врачом.»**; с **6 мес** предупреждения нет; затем по ширине вторичные действия (не на всю строку): **«Помощь маме»** — спокойный outline-стиль; **«Уже введённые продукты»** — лёгкий текстовый/ghost-стиль, диалог `introduced_product_keys`. **Чипсы дней недели** скрыты. Над карточками — короткие **секционные подписи**: «Новый продукт» (newRecipe / `primary`, носитель `breakfast`) и «Уже знакомое блюдо» (familiarRecipe / `secondary`, носитель `lunch`); при заполненном primary одна **компактная строка продуктов** из `getInfantPrimaryProductSummaryLine` (например `… · знакомый: …`); на карточке — бейдж «Новинка» / «Знакомое». Многострочные подписи `getInfantPrimaryIntroducingLinesFromIngredientNames` в плане не используются. Без «Собрать день/неделю», без списка покупок и «Отправить меню». Видимость **не** зависит от того, заполнен ли второй слот (familiar) в плане на день: primary показывается только если после `infantSlotRole: primary` в пуле ≥1 рецепт; secondary — только если `introduced_product_keys` не пуст и в пуле secondary ≥1 рецепт (все ключевые продукты из введённых). Пока введённых нет — только primary (новый пользователь). Если введённые не пусты и новинок в пуле нет (primary пуст), но «знакомых» есть — только «Уже знакомое». Те же правила для групп **4–6 / 7–8 / 9–11** мес. Под заполненной карточкой — **«Ввести &lt;продукт&gt; →»** (короткий CTA старта режима введения): сохраняет `introduced_product_keys` и при старте/смене периода — `members.introducing_product_key` + `members.introducing_started_at`. **Дни:** `daysPassed` = календарная разница «сегодня − дата старта»; в UI **номера дней только 1–3** (`daysPassed` 0–2), без «день 4 из 3». При **3–4 днях** — окно наблюдения (согласовано с советами **3–5 дней** наблюдения в «Помощь маме»): текст про наблюдение, вопрос «Как малыш перенёс…?» (всё хорошо → в `introduced_product_keys` + сброс; не понравилось / была реакция → сброс без автодобавления; «Была реакция» — мягкая отсылка в `/sos`), плюс **«Продолжить с &lt;продукт&gt;»** (`introducing_started_at` = вчера) и **«Попробовать новый продукт»**. При **5+ днях** поля сбрасываются автоматически. При активных днях 1–3 — «Продолжаем вводить…», короткая подсказка про 3 дня введения и окно наблюдения 3–5 дней. Клиентский пул усиливает текущий продукт только при `daysPassed` ≤ 2 (`scoreInfantIntroducingPeriodSort`). Пустой слот: «Мы подбираем подходящий вариант прикорма…». Если кандидатов в пуле нет — блок «Пока нет подходящих вариантов…» + `/sos`, без карточек слотов и без нижнего блока возрастных подсказок. Группа возраста для слотов и soft ranking — `getInfantComplementaryAgeBandU12` в `src/utils/infantComplementaryPlan.ts` (4–6 / 7–8 / 9–11). Пока слот без `recipe_id`, клиент добирает из пула (`pickRecipeFromPool` с `infantSlotRole` + `replaceSlotWithRecipe`). Ранжирование: `scoreInfantIntroducingPeriodSort` для primary; `scoreInfantIntroducedMatch` для secondary. При смене дня сбрасывается `replacingSlotKey`. Смена варианта ↻ (Premium) для прикорма — клиентский пул с ролью слота; при конфликте с `introducing_product_key` — подтверждение и сброс introducing при согласии. **Исключения при клиентском pick (fill/replace):** для прикорма в exclude попадают recipe_id и нормализованные title только **текущего выбранного дня** и session-excludes этого дня — не вся неделя целиком (раньше недельный merge давал ложное `candidates_exhausted` при большом пуле). После успешной замены/добора — `applyReplaceSlotToPlanCache` и опционально `replaceSlotWithRecipe(..., { skipInvalidate: true })`, без полного refetch планов, чтобы не дёргать весь экран. **Автозамена Premium:** до **5** успешных замен на **один слот** за день; в `PoolExhaustedSheet` тексты различают **`limit_reached`** и **`candidates_exhausted`**. В dev / `?debugPool=1` — лог `[infant_plan_fill]`. Логика Edge generate-plan не меняется. Чипы целей и `nutrition_goals` в превью скрыты.

---

## 6. Два контура подбора рецептов для плана

### 6.1 Edge (generate-plan)

- Используется при:
  - **«Подобрать рецепты»** (неделя или день) — `runPoolUpgrade`;
  - **автозаполнение плана** — `start` + `run` (job);
  - **замена слота** через Edge — `replace_slot`.
- Пул: `fetchPoolCandidates` — две выборки: **seed/starter** (лимит 600, чтобы curated-каталог всегда входил в merge) и **manual/week_ai/chat_ai** (лимит как у дня/недели, не ниже 200); иначе при одном `ORDER BY score LIMIT` почти все строки с `score = 0` дают случайный срез без infant/toddler seed. Источники те же: seed, starter, manual, week_ai, chat_ai. **Обычный режим (12+ мес или семья/взрослый):** для каждого слота `pickFromPoolInMemory` с полным набором фильтров (exclude ids/titles, meal_type, обед = только супы, завтрак без супа, sanity, профиль: аллергии, dislikes, возраст при одном профиле, семейный ужин при member_id = null), затем скоринг: **без likes**; цели питания (`selected_goal`, дневное разнообразие — Stage 4.2), возраст/семья/soft-mode (Stage 4.3, без сужения пула в семейном режиме), недельное разнообразие по primary base при недельном плане. **Stage 4.4.2 + финальный composite-ranking:** после **всех** eligibility-фильтров (возраст, аллергии, dislikes, обед=суп, sanity, цели и т.д.) победитель выбирается по **composite score**: slot-fit (базовый скоринг слота: variety, diversity, nutrition goals, age/soft, cultural bonus по `familiarity`) **+** явный бонус по `trust_level` (`planRankComposite.trustRankingBonus`: `core` ≥ `trusted` ≫ `candidate`) **+** умеренный вклад **`recipes.score`** из БД (`dbScoreContribution`, формула feedback в SQL не меняется) **+** при ~15% слотов (детерминированно от salt `day_key|request_id|meal_slot`) — **exploration boost** только для `candidate`/legacy NULL **+** небольшой **jitter** для разнообразия. Полный shuffle кандидатов перед скорингом **убран**; стабильный порядок до расчёта — trust tier → score DESC → id. Логи диагностики: env **`CHAT_PLAN_RANK_DEBUG=true`** или **`DEBUG_POOL=true`** → `CHAT_PLAN_RANK_PICK` (winner, top3, exploration_slot_active). Клиентский пул (`recipePool.ts`) на этом этапе **не** выровнен с Edge.
- **Прикорм (&lt;12 мес, один ребёнок):** отдельная ветка без четырёх слотов — см. §5.4 (`pickInfantComplementaryFromPool`, очистка snack/dinner).
- **Частичный подбор:** если для слота кандидат не найден (`pickFromPoolInMemory` → null), слот **очищается** в БД (явный `null` при merge в `upsertMealPlanRow`), чтобы число заполненных слотов совпадало с тостом «N из 4» и не оставалось «старых» рецептов.
- Рецепты приходят с полем `recipe_ingredients(name, display_text)`, поэтому проверки аллергий и dislikes учитывают ингредиенты.

### 6.2 Клиент

- **«Подобрать рецепты»** при определённых сценариях может использовать клиентский пул (`useGenerateWeeklyPlan` → `pickRecipeFromPool`): те же фильтры по профилю (аллергии, dislikes, возраст по `age_months`), по слоту (meal_type, завтрак без супа, sanity). **Источники** в `.in("source", …)` совпадают с Edge: **`POOL_SOURCES`** в `recipeCanonical.ts` — `seed`, **`starter`**, `manual`, `week_ai`, `chat_ai`. В SELECT подмешиваются **`recipe_ingredients`**, если нужны аллергии, **непустые dislikes**, прикорм (introduced/introducing) или роль infant-слота — тогда `passesProfileFilter` учитывает ингредиенты для аллергий и dislikes.
- **Замена слота из пула** (`useReplaceMealSlot.pickReplacementFromPool`): те же источники и те же фильтры (`passesProfileFilter`), без скоринга по likes.
- **Прикорм (&lt;12 мес), только UI:** `filterPoolCandidatesForSlot`, `listFilteredPoolRecipesForPlanSlot` и `pickRecipeFromPool` в `recipePool.ts` — единая цепочка; опционально **`infantSlotRole`**: `primary` (новый продукт) / `secondary` (только введённые продукты по ключам ингредиентов). При `primary`/`secondary` кандидаты **не** режутся по совпадению `recipes.meal_type` со слотом плана (завтрак/обед в БД — только куда сохранить выбор; каши в seed чаще `breakfast`, второй слот раньше запрашивал `lunch` и получал пустой пул). **не** подменяют Edge generate-plan.
- **Прикорм (&lt;12 мес), блок «Сегодня можно попробовать» (в БД `meal_type` = `INFANT_PLAN_SLOT_NEW_PRODUCT` = `breakfast`):** `evaluateInfantRecipeComplementaryRules`. **Старт (0 введённых):** одна строка продукта из `ALLOWED_START_PRODUCT_KEYS`. **После старта:** **ровно один** новый продукт среди распознанных ключей; каждая пищевая строка ингредиента должна дать ключ — иначе рецепт отклоняется (нельзя надёжно посчитать новизну). Смешанный «1 новый + знакомые» — только здесь, не во втором блоке. Подпись в UI плана: `getInfantPrimaryProductSummaryLine` (компактная одна строка); `getInfantPrimaryIntroducingLinesFromIngredientNames` остаётся для других сценариев/совместимости. Подбор: `pickInfantNewRecipe` / `listInfantNewRecipeCandidates` (не смешивать с знакомым блоком).
- **Блок «Уже знакомое»** (`INFANT_PLAN_SLOT_FAMILIAR` = `lunch`): `evaluateInfantSecondaryFamiliarOnly` — среди **всех** пищевых строк ингредиентов (не технических) каждая должна дать канонический ключ (`normalizeProductKey`); иначе рецепт **не** в familiar. Среди распознанных ключей **не** должно быть новинок относительно `introduced_product_keys` (смешанный «знакомый + новый» — только в primary). `pickInfantFamiliarRecipe` / `listInfantFamiliarRecipeCandidates`. На экране **два слота** рендерятся по наличию введённых продуктов, **не** по числу кандидатов в пуле (второй блок не скрывается из‑за пустого пула при непустом `introduced_product_keys`).
- **Нормализация в ключи:** `normalizeIngredientToProductKey` / `extractAllKeyProductKeysFromIngredients`; для CTA «Ввести …» под primary — `extractProductKeysForIntroduceClick`, `getInfantNovelProductKeysForIntroduce`.
- **Роль слота в пуле:** явный `infantSlotRole` в `pickRecipeFromPool` / `filterPoolCandidatesForSlot`; если не передан и `age_months < 12` — `resolveInfantSlotRoleForPool` маппит **только технические** id строки плана `breakfast` → `primary`, `lunch` → `secondary`; для `snack` / `dinner` роль не задаётся (подбор по `meal_type`, как у 12+). Экран прикорма и `pickInfant*` задают нейтральный `mealType: snack` + явную роль. **`useReplaceMealSlot.pickReplacementFromPool`** для `age_months < 12` и носителей `breakfast`/`lunch` использует ту же `filterPoolCandidatesForSlot` (unified infant-пул, без breakfast/lunch-only по `recipes.meal_type`).
- **Режим возраста (UX):** `getInfantFeedingMode`: до 6 мес — `early_start`, с 6 мес — `standard` (классификатор в коде). **План (hero):** предупреждение про врача показывается только при **4–5 мес** (`showInfantComplementaryDoctorNotice`: `age_months >= 4 && < 6`), не при 6 мес.
- **Отладка отклонений:** `?debugInfant=1` — лог `[INFANT_RULE]` с `recipeId`, `canonicalKeys`, `novelKeys`, `reason`.
- **replace_slot на Edge**: для **не**-прикормового экрана плана при «Заменить» слот может обновляться через Edge `replace_slot`. Для **прикорма** на `MealPlanPage` замена выполняется клиентским пулом (см. §5.4).

---

## 7. Итоговая таблица: что влияет на подбор рецептов в меню на день и неделю

| Фактор | Режим «Семья» | Один профиль | Где учитывается |
|--------|----------------|--------------|------------------|
| **Аллергии** | Объединённый список всех членов | allergies выбранного профиля | Edge и клиентский пул: title, description, tags, recipe_ingredients (при непустых аллергиях на клиенте строки ингредиентов подгружаются в запрос). Матч: подстроки токенов (`containsAnyTokenForAllergy` / `recipeMatchesAllergyTokens`). |
| **Не любит** | Объединённый список всех членов | dislikes выбранного профиля | Edge и клиентский пул: те же поля, включая ингредиенты при непустых dislikes на клиенте. На клиенте матч dislikes — `containsAnyToken` (граница слова); на Edge — `recipeMatchesTokens` / `includesTokenSoft` (для коротких токенов возможны мелкие отличия от границ слова). |
| **Любит** | В `member_data` на клиенте может быть объединённый список | likes выбранного профиля в payload | **generate-plan:** не влияет на пул. **Чат:** мягкий сигнал в промпте (likesFavoring). Клиентский пул — без приоритета по likes. |
| **Возраст** | Не применяется (общий стол) | age_months: фильтр min/max_age, ключевые слова до 12 мес, 12–24 мес, &lt;36 мес | Edge: recipeFitsAgeRange, recipeBlockedByInfantKeywords, memberAgeContext. Клиент: age_months &lt; 36 → AGE_RESTRICTED_TOKENS (остро, кофе, грибы). |
| **Семейный ужин** | Только для слота «ужин»: исключение стейк/редкое мясо и т.д.; при нехватке кандидатов — fallback без фильтра | Не используется | Только Edge, только при member_id = null. |
| **Слот (обед = супы, завтрак без супа и т.д.)** | Да | Да | Edge и клиент: meal_type, is_soup/soup-токены, sanity-списки. |
| **Исключение повторов** | По уже использованным recipe_id и title_key в плане (день/неделя + последние дни) | То же; **исключение:** клиентский прикорм (fill/replace на `MealPlanPage`) — только **день + session** для выбранной даты | Edge: excludeRecipeIds, excludeTitleKeys, recentSignatures. Клиент 12+: `replaceExclude*Merged` (неделя). Клиент infant: `infantDayReplaceExclude*Merged` в `MealPlanPage`. |

---

## 8. Переход из плана в чат: предзаполнение поля ввода (prefill)

Когда пользователь открывает чат из плана с готовой фразой в поле ввода (без автоматической отправки):

- **Транспорт:** React Router `navigate("/chat", { state: { … } })`. Ключевые поля: `prefillMessage` (строка), `prefillOnly: true` (только вставка в input), плюс контекст слота: `fromPlanSlot`, `plannedDate`, `mealType`, `memberId`.
- **Маппинг текста по слоту** (единый источник на клиенте): `src/utils/planChatPrefill.ts` — `getPlanSlotChatPrefillMessage(meal_type)`:
  - `breakfast` → «Подберите завтрак»
  - `lunch` → «Подберите обед»
  - `snack` → «Подберите перекус»
  - `dinner` → «Подберите ужин»
  - неизвестный тип → «Подберите блюдо»
- **Где задаётся:** `PoolExhaustedSheet` (после «Сгенерировать в чате» при исчерпании пула); пустой день на `MealPlanPage` — кнопки «Сгенерировать в чате» / «Подобрать рецепт» используют `firstEmptySlotId` для `mealType` и той же фразы.
- **Применение на экране чата:** `ChatPage` читает `location.state.prefillMessage` после готовности истории (`isChatBootstrapped`, не во время `isLoadingHistory`), выставляет `input`, затем **replace**-навигация без `prefillMessage` в state (чтобы не срабатывать повторно). История сообщений может быть непустой — prefill всё равно подставляется в поле ввода.
- **Исключение:** сценарий сканирования продуктов (`ScanPage`) передаёт `prefillMessage` **без** `prefillOnly: true` — сохраняется прежнее поведение с отложенной автоотправкой.

---

## 9. Выгрузка/экспорт плана

Под «выгрузкой блюд» здесь понимается **заполнение плана рецептами** (день/неделя), а не экспорт в файл. Вся описанная выше логика определяет, **какие рецепты подставляются** в слоты плана. При экспорте (если он реализован) в выгрузку попадают уже выбранные блюда и их метаданные; дополнительные правила фильтрации на этапе экспорта в коде не применяются — учитываются только те ограничения, которые были применены при подборе (профиль, аллергии, dislikes, возраст, семейный режим, слоты).

---

## 10. Клиентский UI вкладки «План» (hero, без изменения логики подбора)

Поведение разделов 1–8 **не зависит** от расположения кнопок. Для актуальной раскладки экрана (где справка о профиле, цели, шаринг недели, иерархия CTA) см. **`docs/dev/plan-tab-ui-quiet-hero-2026-03.md`**.

Кратко (на март 2026):

- Подсказка «как учитывается профиль» не дублируется под датой; открывается из меню «Ещё».  
- Дата в hero — **одна строка** (`formatDayHeader`, без «Сегодня»). Профиль и цель — **рядом** в одной строке (`justify-start gap-3`); выбор цели — **диалог** в формате селектора профиля (`Dialog`, список строк).  
- В hero: **«Собрать день»** (primary) и **«Собрать неделю»** (текстовый tertiary teaser; у Free — 🔒 и метка Premium). Под списком блюд: **«Собрать список продуктов»** (secondary outline), затем **«Отправить меню»** (ghost) — только если в дне есть блюда.  
- **«Отправить меню на неделю»** — только в меню «Ещё» для подписчиков.

**Профиль ребёнка &lt; 12 мес (не «Семья»):** отдельная ветка UI без hero-CTA «Собрать день/неделю», без списка покупок и «Отправить меню»; заголовок «План прикорма на сегодня», дата и меню — верхняя строка; ниже чип ребёнка — единый спокойный info-блок (мелкий текст; при 4–5 мес — предупреждение про врача внутри блока), вторичные действия **«Помощь маме»** (outline) и **«Уже введённые продукты»** (ghost); без чипсов дней; число слотов по группам 0–6 / 7–8 / 9–11 мес (§5.4); короткие **секционные подписи** («Новый продукт» / «Уже знакомое блюдо») и строка `getInfantPrimaryProductSummaryLine` над primary при данных превью; под карточкой **primary** — «Ввести &lt;продукт&gt; →» при наличии невведённого продукта; для **secondary** кнопки нет; пустой слот — «Мы подбираем…»; нет кандидатов — блок «Пока нет подходящих вариантов…» + `/sos`; ↻; Premium — до 5 автозамен на слот в день + infant `PoolExhaustedSheet`; Free — paywall на замену; чипы целей скрыты.

---

**Документация обновлена:** создан новый документ `docs/architecture/PLAN_MENU_PROFILE_AND_RECIPE_SELECTION.md`. Существующие канонические документы [ALLERGIES_AND_PLAN_SOURCE_OF_TRUTH.md](../decisions/ALLERGIES_AND_PLAN_SOURCE_OF_TRUTH.md), [MEAL_TYPE_AND_LUNCH_SOUP.md](../decisions/MEAL_TYPE_AND_LUNCH_SOUP.md), [family-nutrition-rules-map.md](./family-nutrition-rules-map.md) и [PREFERENCES_BERRIES_RATIO.md](../decisions/PREFERENCES_BERRIES_RATIO.md) не изменялись; этот файл их дополняет и ссылается на них.
