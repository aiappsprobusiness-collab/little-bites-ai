# Вкладка «Помощник рядом»: реализация UX и лимитов

Документ описывает, **как реализованы** последние правки вкладки Help: дисклеймер, quick chips (Free/Premium), карточка «Сегодня спрашивают», лимит вопросов и paywall. Используется для поддержки и отладки.

**Связанный документ:** [help-tab-functionality-description-ru.md](../help-tab-functionality-description-ru.md) — общее описание функционала для пользователя и промптов.

---

## 1. Файлы и роли

| Файл | Назначение |
|------|------------|
| `src/pages/SosTiles.tsx` | Страница Help: **главный вход** — блок «Сегодня спрашивают» (первым), затем Hero, список тем, sheet и paywall. `handleOpenWithMessage(text)` всегда открывает sheet с сообщением (в т.ч. для premium-вопросов у Free — показывается preview). При лимите — `onLimitReached`. Передаёт в sheet `popularQuestionTextIfPremium` для логики preview. |
| `src/components/sos/SosHero.tsx` | Hero: placeholder «Что происходит с ребёнком?», подсказка «Например: ребёнок стал хуже есть», дисклеймер (text-xs, leading-relaxed), quick chips. Для Free по тапу на premium‑чип — `onPremiumChipTap` (paywall); при отправке из поля ввода premium-текст открывается sheet и показывается preview. |
| `src/components/sos/SosTopicGrid.tsx` | Сетка карточек тем по секциям: иконка, заголовок, подзаголовок (line-clamp-2), для Premium-тем — бейдж Star + Premium, по клику locked → paywall. |
| `src/components/help/TopicConsultationSheet.tsx` | Нижний sheet с чатом по теме: чипсы (Free сначала, premium с иконкой Star), input, история, retry. **Preview для Free:** при ответе на premium-вопрос (из «Сегодня спрашивают» или premium-чипа) показываются первые 2–3 абзаца и блок «Продолжение ответа доступно в расширенной консультации» + кнопка «Получить полный разбор (Premium)» → paywall. Запрос для premium-вопроса у Free отправляется как обычно; обрезка только в UI. При `LIMIT_REACHED` — текст лимита в чате и `onLimitReached`. |
| `src/data/helpTopicChips.ts` | Quick chips для topic `"quick"`: список с полями `label`, `text`, `access: "free" \| "paid"`. **Порядок по частоте запросов:** Не хочет есть, Новый продукт, Стул малыша, Срыгивания, Аллергия, Режим кормления, затем остальные. Экспорт: `getPremiumQuickChipTexts()`, `isPremiumQuickChipText(text)`. |
| `src/features/help/config/popularQuestions.ts` | Пул популярных вопросов для «Сегодня спрашивают»: тип `PopularQuestion` (id, text, category, access). Функция `getPopularQuestionForToday({ hasAccess, date? })`: ротация 1 раз в день по категории дня (Пн=nutrition, Вт=baby, Ср=allergy, Чт/Вс=routine, Пт=nutrition, Сб=baby) и индексу дня в году. Free видит только вопросы с `access: "free"` в карточке; при открытии по deep-link или с premium-вопросом дня (если доступ меняется) возможен preview. |
| `src/hooks/useDeepSeekAPI.tsx` | Запрос к `deepseek-chat`. При 429 и `code === 'LIMIT_REACHED'` или `error === 'LIMIT_REACHED'` бросает `Error('LIMIT_REACHED')` (payload опционален). При успешном ответе help — вызывает `refetchUsage()`. |
| `src/hooks/useSubscription.tsx` | `helpRemaining`, `helpLimitExceeded` из `get_usage_count_today(..., "help")` и `limits.helpDailyLimit`. `refetchUsage()` инвалидирует запросы `["usage-help-today", user?.id]` и др. |

---

## 2. Hero: placeholder, подсказка, дисклеймер

- **Placeholder поля ввода:** «Что происходит с ребёнком?»
- **Подсказка под полем:** «Например: ребёнок стал хуже есть» (`text-xs text-muted-foreground leading-snug`).
- **Дисклеймер:** «Ответы носят информационный характер и не заменяют консультацию врача.» — стиль `text-xs text-muted-foreground leading-relaxed`.
- **Файл:** `SosHero.tsx`.

---

## 3. Quick chips (Hero и chat sheet)

- **Данные:** `helpTopicChips.ts` — массив с `access: "free" \| "paid"`. **Порядок по частоте запросов:** 1) Не хочет есть, 2) Новый продукт, 3) Стул малыша, 4) Срыгивания, 5) Аллергия, 6) Режим кормления, затем «Когда срочно к врачу», «Дневник питания».
- **Hero:** при тапе по чипу: если `access === "paid"` и `!hasAccess` → `onPremiumChipTap()` (paywall), иначе `onOpenWithMessage(chip.text)`. Premium‑чипы для Free отображаются с иконкой Star (Lucide) и лёгким amber‑стилем.
- **SosTiles:** `handleOpenWithMessage(text)` всегда открывает sheet и подставляет текст (в т.ч. для premium); блокировки по premium нет — у Free показывается preview ответа в sheet.
- **TopicConsultationSheet:** при тапе по чипу: если `access === "paid"` и `!hasAccess` → `onPremiumChipTap()`, иначе вставка текста в input. При отправке premium-вопроса запрос выполняется; для Free после ответа показывается preview (первые 2–3 абзаца) и CTA «Получить полный разбор (Premium)». В sheet чипсы сортируются: Free сначала, потом Premium.

---

## 4. Блок «Сегодня спрашивают» (главный вход)

- **Расположение:** первый блок на странице Help (выше Hero), чтобы быть главным входом.
- **Иконка:** IconBadge с иконкой HelpCircle, variant sage, size sm.
- **Вопрос дня:** `getPopularQuestionForToday({ hasAccess })`. Ротация раз в день, детерминирована по дате; категория по дню недели; внутри категории — по дню года. Free в карточке видит только вопросы с `access: "free"`; при смене доступа или тестах возможен premium-вопрос.
- **Клик:** `handleOpenWithMessage(popularQuestion.text)` — открывается sheet с подставленным текстом. У Free при premium-вопросе дня (если показывается) — запрос отправляется, показывается preview ответа и CTA на paywall.
- **Лимит:** при `helpLimitExceeded` кнопка карточки `disabled`.
- **Вёрстка:** компактный блок (rounded-2xl, border, shadow-soft), заголовок «Сегодня спрашивают», текст вопроса: `text-base font-medium leading-snug`, `line-clamp-2`; hover `hover:bg-muted/40`.
- **Передача в sheet:** при `!hasAccess && popularQuestion.access === "premium"` в sheet передаётся `popularQuestionTextIfPremium: popularQuestion.text` для отображения preview.

---

## 4.1. Карточки тем (SosTopicGrid)

- **Файл:** `src/components/sos/SosTopicGrid.tsx`. Список тем по секциям на странице Help.
- **Иконки:** используется единый компонент **IconBadge** (`src/components/ui/IconBadge.tsx`): скруглённая плашка (~36px, radius 10px) с тонкой SVG-иконкой из **lucide-react**. Иконка и оттенок плашки задаются в `src/data/sosTopics.ts` полями `icon` и `badgeVariant` (sage, sand, apricot, mint, blue, amber). Темы: питание — sage/sand, малыш/здоровье — apricot, аллергия/срочная помощь — blue. Без emoji в карточках.
- **Premium-темы:** для Free у тем с `requiredTier === "paid"` отображается бейдж «Star + Premium» (иконка Star из Lucide, стиль amber: `text-amber-700 bg-amber-100/80`). По клику — `onLockedSelect()` (paywall).
- **Вёрстка:** карточки компактные (padding p-3, gap 2.5), заголовок и подзаголовок по 2 строки макс. (`line-clamp-2`), слева IconBadge, стрелка 16px. Цель — помещать на экран 4–5 карточек.

---

## 5. Лимит вопросов и paywall

- **Бэкенд (deepseek-chat):** для типа `sos_consultant` у Free проверяется `get_usage_count_today(..., "help")`; при `used >= 2` возвращается 429 с телом `{ code: "LIMIT_REACHED", payload: { feature: "help", limit, used } }`. После успешного ответа AI пишется событие в `usage_events` с `feature: "help"`.
- **Фронт при LIMIT_REACHED:** в `TopicConsultationSheet` в catch проверяется `msg === "LIMIT_REACHED"` → вызывается `onLimitReached()`, в чате показывается «Лимит на сегодня исчерпан. Попробуйте завтра или откройте Trial.» (не «Ошибка отправки»).
- **onLimitReached в SosTiles:** вызывается `refetchUsage()` (инвалидация запросов usage), выставляется кастомное сообщение paywall, затем `openPaywallFromSheet()` — закрытие sheet и открытие paywall, чтобы paywall был поверх экрана.

---

## 6. Почему счётчик не обновляется на 0 / почему снова «Ошибка»

### Счётчик «осталось 0» после исчерпания лимита

- **Логика:** при `LIMIT_REACHED` в `onLimitReached` передаётся payload с бэкенда `{ feature: "help", limit: 2, used: 2 }`. SosTiles вызывает `setHelpUsedToday(used)` из useSubscription — это сразу выставляет в кэш React Query значение `usage-help-today` (через `queryClient.setQueryData`). В результате `helpRemaining = helpDailyLimit - helpUsed` пересчитывается (0) без ожидания refetch.
- **Fallback:** если payload нет (тело 429 не распарсилось), выставляется `setHelpUsedToday(2)`, чтобы счётчик всё равно показал 0.
- Дополнительно вызывается `refetchUsage()` для синхронизации с сервером.

### «Ошибка отправки» при исчерпанном лимите (баг, исправлен)

- **Причина:** при ответе бэкенда 429 тело иногда не парсилось как JSON (пустое/искажённое). Тогда проверка `code === 'LIMIT_REACHED'` не срабатывала, хук бросал `Error('HTTP 429')`, в чате показывалось «Ошибка отправки», paywall не открывался.
- **Исправление:** в `useDeepSeekAPI` для help при **любом** 429 теперь всегда бросается `Error('LIMIT_REACHED')` (если по телу не распознали — для help всё равно LIMIT_REACHED). При 429 для help вызывается `refetchUsage()` до throw. В итоге при исчерпанном лимите Free всегда видит текст про лимит и paywall.

### «Ошибка отправки» при не исчерпанном лимите

- Показывается только при ошибке запроса (не LIMIT_REACHED, не HELP_TIMEOUT) — сеть, 500, таймаут. При разрешённом вопросе и не исчерпанном лимите это сбой запроса/бэкенда, а не логика лимита.

---

## 7. Расширение

- **Тексты и чипсы:** правки в `helpTopicChips.ts` и в `popularQuestions.ts`.
- **Категории дня / ротация:** правки в `popularQuestions.ts` (`CATEGORY_BY_DAY_OF_WEEK`, логика в `getPopularQuestionForToday`).
- **Ротация из аналитики или бэкенда:** заменить/обернуть `getPopularQuestionForToday` (например возвращать вопрос из API), UI менять не требуется.
- **Новые темы/чипсы:** добавить элементы в соответствующие массивы с полем `access` при необходимости.
