# Аудит: семейный возраст и правила отбора членов семьи

**Дата:** 2025-03-05  
**Задача:** Проверить реализацию правил 1–3 (дети <12 мес не учитываются; 12–35 мес → kid safety; возраст для параметров = старший из учитываемых).  
**Ограничение:** Только аудит, без изменений кода.

---

## A) Места применения семейных правил возраста

| Место | Файл | Назначение |
|-------|------|------------|
| Исключение <12 мес, applyKidFilter 12–35 | `_shared/familyMode.ts` | `getFamilyPromptMembers`, `buildFamilyMemberDataForChat`, `buildFamilyMemberDataForPlan` |
| Выбор «primary» для возраста в чате | `deepseek-chat/index.ts` (497–507), `buildPrompt.ts` (109–110, 228–232) | `primaryForAge`, `ageMonthsForCategory`, `ageCategoryForLog`; recipe V3 prompt |
| Контекст генерации (семья, без младенцев в тексте) | `_shared/familyContextBlock.ts` | `buildFamilyGenerationContextBlock` |
| Тег kid_1_3_safe при сохранении рецепта | `deepseek-chat/index.ts` (1019) | `recipeTags` |
| min/max age при сохранении рецепта | `deepseek-chat/index.ts` (1009–1038) | `AGE_RANGE_BY_CATEGORY[ageCategoryForLog]` |
| План: семейные данные и пул | `generate-plan/index.ts` (537, 648–655) | `buildFamilyMemberDataForPlan`, `getMemberAgeContext`, `pickFromPoolInMemory` |
| Storage member (семья) | `_shared/familyStorageMember.ts` | `pickFamilyStorageMemberId` (старший ≥12) |
| Возрастная категория | `deepseek-chat/ageCategory.ts` | `getAgeCategory` |
| Возраст для плана/пула | `_shared/memberAgeContext.ts` | `getMemberAgeContext`, `isAdultContext` |

---

## B) Правило 1: Дети <12 мес НЕ учитываются

**Требование:** Не учитывать ни в генерации рецепта (чат), ни в плане (day/week), ни в подборе/скоринге из пула.

### 1) Генерация рецепта в чате (deepseek-chat)

**Код:**

- `_shared/familyMode.ts`, 76–80:
```ts
const nonInfantMembers = members.filter(
  (m) => m.age_months == null || (Number.isFinite(m.age_months) && (m.age_months as number) >= 12)
);
const membersForPrompt = nonInfantMembers.length > 0 ? nonInfantMembers : members;
```

- `deepseek-chat/index.ts`, 489–494:
```ts
const { membersForPrompt, applyKidFilter: kidFilter } = getFamilyPromptMembers(allMembers ...);
memberDataNorm = buildFamilyMemberDataForChat(membersForPrompt ...);
familyMembersForPrompt = membersForPrompt;
```

**Что происходит:**  
Если есть хотя бы один член с `age_months >= 12` или `null`, в промпт и в агрегацию (аллергии/лайки/дизлайки) попадают только они; младенцы <12 мес не входят в `membersForPrompt`. Если все <12 — в промпт попадают все (но тогда `buildFamilyMemberDataForChat` всё равно даёт `age_months: 216`).  
**Вход:** `allMembers`. **Выход:** `membersForPrompt` (без младенцев при наличии ≥12), `memberDataNorm` и `familyMembersForPrompt` строятся уже по ним.  
**Итог:** В чате (recipe-path) младенцы <12 мес при наличии кого-то ≥12 мес не учитываются.

### 2) Генерация плана (generate-plan day/week)

**Код:**

- `generate-plan/index.ts`, 647–650:
```ts
const { data: membersRows } = await supabase.from("members").select("...").eq("user_id", userId);
const membersList = (membersRows ?? []) as Array<...>;
effectiveMemberData = buildFamilyMemberDataForPlan(membersList);
```

- `_shared/familyMode.ts`, 91–107 — `buildFamilyMemberDataForPlan(members)` вызывает `buildFamilyConstraints(members)` по **всем** переданным членам.

**Что происходит:**  
В план передаётся полный список членов из БД (включая <12 мес). Ограничения (аллергии, дизлайки и т.д.) собираются по всем, включая младенцев. При этом возвращается `type: "adult"`, поэтому `getMemberAgeContext(effectiveMemberData)` даёт `applyFilter: false` и возрастная фильтрация пула не применяется.  
**Итог:** Для возраста в плане младенцы не используются (режим adult). Но для ограничений (аллергии/дизлайки) они **учитываются** — в отличие от чата, здесь нет вызова `getFamilyPromptMembers`, то есть явного исключения <12 мес из списка перед сбором ограничений.

**Вывод по правилу 1 (план):** Реализовано **частично**: по возрасту младенцы не учитываются; по аллергиям/дизлайкам — учитываются.

### 3) Подбор/скоринг рецептов из пула (generate-plan)

**Код:**

- `generate-plan/index.ts`, 249–255:
```ts
const ageContext = getMemberAgeContext(memberData);
if (ageContext.applyFilter && ageContext.ageMonths != null) {
  filtered = filtered.filter((r) => recipeFitsAgeRange(r, ageContext.ageMonths!));
  ...
}
if (isAdultContext(memberData)) {
  filtered = filtered.filter((r) => r.max_age_months == null || r.max_age_months > 12);
}
```

Для семьи `memberData = buildFamilyMemberDataForPlan(membersList)` с `type: "adult"` → `getMemberAgeContext` даёт `applyFilter: false`, `isAdultContext` = true. То есть возраст для фильтрации пула не берётся от младенцев.  
**Итог:** В подборе из пула младенцы <12 мес не задают возраст и не участвуют в age-based фильтрации (режим adult). Семейная логика «только учитываемые члены» в плане не дублирует чат: в плане нет вызова `getFamilyPromptMembers`, поэтому формально «учёт» для ограничений всё ещё по всем членам.

---

## B) Правило 2: Ребёнок 12–35 мес → kid safety, тег kid_1_3_safe

**Требование:** Блюдо безопасное (без жарки/острого/choking hazards), подходит и взрослым; признак kid_1_3_safe выставляется где нужно.

### 1) applyKidFilter (12–35 мес)

**Код:** `_shared/familyMode.ts`, 81–85:

```ts
const hasToddlers1to3 = membersForPrompt.some((m) => {
  const age = m.age_months;
  return age != null && Number.isFinite(age) && age >= 12 && age <= 35;
});
return { membersForPrompt, applyKidFilter: hasToddlers1to3 };
```

**Что происходит:** По уже отфильтрованным для промпта членам (без младенцев при наличии ≥12) проверяется наличие возраста в [12, 35]. Если есть — `applyKidFilter: true`.  
**Итог:** Реализовано: kid filter включается ровно при наличии кого-то 12–35 мес среди учитываемых.

### 2) Текст в контексте генерации (без жарки/острого/choking hazards)

**Код:** `_shared/familyContextBlock.ts`, 55–59:

```ts
if (applyKidFilter) {
  lines.push(
    "Additionally apply kid safety for ages 1–3: minimal salt/sugar, no deep fry/spicy/smoked, avoid choking hazards, prefer soft pieces and stewing/baking."
  );
}
```

**Итог:** В промпте явно задаётся kid safety (минимальная соль/сахар, без жарки/острого/копчёного, без choking hazards, мягкие кусочки, тушение/запекание). Блюдо не сводится к «детскому пюре» — формулировка подходит и взрослым.

### 3) Тег kid_1_3_safe при сохранении рецепта

**Код:** `deepseek-chat/index.ts`, 1019:

```ts
const recipeTags = targetIsFamily ? [...baseTags, "family", ...(applyKidFilter ? ["kid_1_3_safe"] : [])] : baseTags;
```

**Итог:** В семейном режиме при `applyKidFilter === true` к рецепту добавляется тег `kid_1_3_safe`. Правило соблюдено.

---

## B) Правило 3: «Возраст для базовых параметров» = старший из учитываемых (max age_months, <12 исключены)

**Требование:** За основу брать СТАРШЕГО (max age_months среди учитываемых), младенцы <12 мес исключены из расчёта.

### 1) primaryForAge и ageCategoryForLog в deepseek-chat

**Код:** `deepseek-chat/index.ts`, 497–507:

```ts
const primaryForAge =
  targetIsFamily && memberDataNorm ? memberDataNorm : (memberDataNorm ?? (allMembers.length > 0 ? findYoungestMember(allMembers) : null));
let ageMonthsForCategory = primaryForAge ? getAgeMonths(primaryForAge) : 0;
// ...
const ageCategoryForLog = getAgeCategory(ageMonthsForCategory);
```

В семейном режиме `memberDataNorm = buildFamilyMemberDataForChat(membersForPrompt)` — это агрегат «Семья» с **фиксированным** `age_months: ADULT_AGE_MONTHS` (216) в `_shared/familyMode.ts`, 124–125.  
Значит, для семьи всегда `primaryForAge = memberDataNorm`, `ageMonthsForCategory = 216`, `ageCategoryForLog = "adult"`.  
**Итог:** Для лога и для сохранения рецепта (min/max age) используется не max(age_months) учитываемых, а **фиксированный взрослый возраст 216**. Правило «старший из учитываемых» здесь **не** реализовано (например, при семье 24+36 мес по правилу должно быть 36, а не 216).

### 2) Recipe prompt V3 — какой возраст уходит в промпт

**Код:** `deepseek-chat/buildPrompt.ts`, 228–232:

```ts
const primaryMember = (targetIsFamily && allMembers.length > 0)
  ? findYoungestMember(allMembers)
  : memberData;
// ...
const rawMonths = primaryMember ? getAgeMonths(primaryMember) : 0;
```

`allMembers` при вызове из index — это `allMembersForPrompt`, то есть в семье уже `membersForPrompt` (без младенцев при наличии ≥12).  
**Что происходит:** Для семьи в текст рецепта (возраст, ageRule) берётся **младший** из учитываемых (`findYoungestMember`), а не старший.  
**Итог:** Реализовано **наоборот** требованию: используется младший, а не старший. Это расхождение с правилом 3.

### 3) min_age_months / max_age_months при сохранении рецепта

**Код:** `deepseek-chat/index.ts`, 1009–1038:

```ts
const ageRange = AGE_RANGE_BY_CATEGORY[ageCategoryForLog] ?? AGE_RANGE_BY_CATEGORY.adult;
const minAge = ...; const maxAge = ...;
// ...
min_age_months: minAge,
max_age_months: maxAge,
```

`ageCategoryForLog` в семье всегда «adult» (см. выше), значит диапазон всегда взрослый (216–1200). С правилом «старший из учитываемых» при семье только с детьми (например 24 и 36 мес) ожидалась бы категория toddler и другой диапазон.  
**Итог:** Сейчас min/max не конфликтуют с текущей логикой (всегда adult в семье), но сама логика не следует правилу 3 (нет max age среди учитываемых).

### 4) План (generate-plan)

Для плана в семье используется `buildFamilyMemberDataForPlan` → `type: "adult"`, без `age_months` для фильтра. То есть «возраст для параметров» в плане не строится ни от младшего, ни от старшего — просто отключён (adult). Отдельного расчёта «старший из учитываемых» в плане нет.

---

## C) Противоречия и корректность

### 1) ageCategory и kidFilter не используют младенцев <12 мес

- В чате перед расчётом категории и kid filter вызывается `getFamilyPromptMembers(allMembers)`. Младенцы <12 при наличии кого-то ≥12 не входят в `membersForPrompt`.  
- `applyKidFilter` считается по `membersForPrompt` (81–85 familyMode.ts).  
- `memberDataNorm` и далее `ageCategoryForLog` строятся от `memberDataNorm` с фиксированным 216 в семье.  
**Вывод:** Младенцы <12 мес не участвуют в ageCategory и kidFilter в чате. Противоречий нет.

### 2) primaryForAge / «primary member» для возраста

- В **index.ts** для семьи: `primaryForAge = memberDataNorm` → возраст для лога и сохранения = 216 (adult). Не «primary по возрасту» из членов, а константа.  
- В **buildPrompt.ts** в `applyPromptTemplate`: при семье и наличии `memberData` берётся `memberData` (тот же агрегат 216) — для не-recipe промпта это согласовано.  
- В **buildPrompt.ts** в `generateRecipeSystemPromptV3`: при семье берётся `findYoungestMember(allMembers)` — это **младший** среди учитываемых.  
**Вывод:** Функция, задающая «primary для возраста» в recipe-path — `findYoungestMember` в `generateRecipeSystemPromptV3`. Она выбирает **младшего**, а не старшего. По правилу 3 должен использоваться старший — это баг.

### 3) min_age_months / max_age_months при сохранении

Они выводятся из `ageCategoryForLog` → `AGE_RANGE_BY_CATEGORY`. В семье категория всегда adult, диапазон 216–1200. С текущей логикой конфликта нет, но логика не соответствует правилу 3 (возраст от старшего из учитываемых).

---

## D) Итоговый вердикт

| Правило | Вердикт | Пояснение |
|--------|---------|-----------|
| **1** | **Частично да** | **Чат:** младенцы <12 мес при наличии ≥12 не учитываются (`getFamilyPromptMembers` → `membersForPrompt`). **План:** по возрасту не учитываются (adult, без age filter), но при сборе ограничений вызывается `buildFamilyMemberDataForPlan(membersList)` по **всем** членам из БД — аллергии/дизлайки младенцев учитываются. **Пул (план):** возраст для фильтрации не от младенцев (applyFilter: false). |
| **2** | **Да** | 12–35 мес → `applyKidFilter` в familyMode; контекст с kid safety в familyContextBlock; тег `kid_1_3_safe` при сохранении в index.ts. Блюдо не «только пюре», формулировка подходит и взрослым. |
| **3** | **Нет** | **Ожидалось:** возраст для параметров = max(age_months) среди учитываемых (без <12). **Факт:** в чате для лога и сохранения используется фиксированный взрослый возраст 216 (`buildFamilyMemberDataForChat`); в тексте recipe prompt (V3) используется **младший** член (`findYoungestMember` в buildPrompt.ts). Ни «старший», ни max(age_months) нигде не считаются. |

---

## Сводка файлов и строк (подтверждение/опровержение)

- **Правило 1 (исключение <12):**  
  - Реализация: `_shared/familyMode.ts` 76–80 (`getFamilyPromptMembers`); использование в чате: `deepseek-chat/index.ts` 491–494.  
  - План не исключает <12 из списка перед сбором ограничений: `generate-plan/index.ts` 648–650 (`buildFamilyMemberDataForPlan(membersList)` без предварительного `getFamilyPromptMembers`).

- **Правило 2 (kid safety 12–35, kid_1_3_safe):**  
  - `_shared/familyMode.ts` 81–85 (`applyKidFilter`); `_shared/familyContextBlock.ts` 55–59 (текст); `deepseek-chat/index.ts` 1019 (тег).

- **Правило 3 (старший для параметров):**  
  - Не реализовано. Места, где задаётся возраст:  
    - `deepseek-chat/index.ts` 497–499 (`primaryForAge = memberDataNorm` → 216);  
    - `deepseek-chat/buildPrompt.ts` 88–89 (`findYoungestMember`), 109–110 (applyPromptTemplate), 228–232 (generateRecipeSystemPromptV3 — **здесь баг:** используется младший вместо старшего).

- **Storage member (старший ≥12):**  
  - Соответствует идее «учёт без младенцев»: `_shared/familyStorageMember.ts` 25–34 (candidates ≥12, затем max age_months).
