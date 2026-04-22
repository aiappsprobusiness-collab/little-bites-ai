# Вкладка «Помощь маме»: реализация UX и лимитов

Документ описывает, **как реализованы** последние правки вкладки Help (в навигации — «Помощь маме»): дисклеймер, quick chips (Free/Premium), карточка «Сегодня спрашивают», лимит вопросов и paywall. Используется для поддержки и отладки.

**Связанный документ:** [help-tab-functionality-description-ru.md](../help-tab-functionality-description-ru.md) — общее описание функционала для пользователя и промптов.

---

## 1. Файлы и роли

| Файл | Назначение |
|------|------------|
| `src/pages/SosTiles.tsx` | Страница Help: **`MobileLayout` без хедера**; Hero → «Сегодня спрашивают» → **две секции карточек** из `getHelpMonetizationSections()` («Популярные вопросы» = 2 free-сценария, «Разбор ситуаций» = остальные темы Premium). У Free тап по Premium-карточке **не открывает sheet** — только локальный paywall; deep-link `?scenario=` на premium без подписки — paywall и редирект на `/sos`. Free-сценарии открывают `TopicConsultationSheet` с заголовком `getTopicDisplayTitle`. |
| `src/pages/SosScenarioScreen.tsx` | Полноэкранный сценарий `/sos/:scenarioKey`: при `requiredTier === "paid"` и `!hasAccess` — глобальный paywall (`setShowPaywall`) и возврат на `/sos`. |
| `src/data/sosTopics.ts` | Конфиг тем: **`requiredTier`** `free` только у `food_refusal` и `urgent_help`; остальные — `paid`. **`displayTitle`** — короткий заголовок в списке и sheet. **`getHelpMonetizationSections()`** — порядок секций и тем для главной Help. |
| `src/components/sos/SosHero.tsx` | Hero: заголовок «Помощь маме», подзаголовок «Что происходит с ребёнком?», placeholder «Например: ребёнок стал хуже есть», поле ввода и кнопка «Спросить», счётчик лимита (для Free), quick chips. Дисклеймер в Hero не показывается (перенесён в низ страницы). Для Free по тапу на premium‑чип — `onPremiumChipTap` (paywall); при отправке из поля ввода premium-текст открывается sheet и показывается preview. |
| `src/components/sos/SosTopicGrid.tsx` | Сетка карточек: заголовок из `getTopicDisplayTitle`; у Free на Premium-темах — бейдж Lock + Star + «Premium», лёгкое затемнение карточки; клик → `onLockedSelect()` (paywall). У подписчиков бейджей нет. |
| `src/components/help/TopicConsultationSheet.tsx` | Нижний sheet с чатом по теме: чипсы (Free сначала, premium с иконкой Star), input, история, retry. **Preview для Free:** при ответе на premium-вопрос (из «Сегодня спрашивают» или premium-чипа) показываются первые 2–3 абзаца и блок «Продолжение ответа доступно в расширенной консультации» + кнопка «Получить полный разбор (Premium)» → paywall. Запрос для premium-вопроса у Free отправляется как обычно; обрезка только в UI. При `LIMIT_REACHED` — текст лимита в чате и `onLimitReached`. **Лента и composer (мобильный UX):** автоскролл к низу после отправки и при росте контента, если пользователь не ушёл вверх (порог как во вкладке «Чат»); поле ввода — общий helper `applyTextareaAutosize` (тот же max-height, что у `ChatInputBar`). Перед превью и рендером ответа из текста **убирается** секция «к врачу» (п.3 промпта модели), см. `stripHelpDoctorSection`. |
| `src/components/help/HelpResponseBlocks.tsx` | Разбор ответа на блоки «Коротко» / «Что можно сделать прямо сейчас» (карточки с иконками). Секция **«К врачу если»** отдельным блоком **не выделяется**; текст после её заголовка отрезается в UI. В конце ответа у **~50% сообщений** (детерминированно по `messageId`) показывается мягкая строка со ссылкой на тему `urgent_help` (`HelpDoctorReminderLine`). **Markdown:** `ReactMarkdown` + `prose`; для читаемости в тёмной теме те же приёмы, что в консультации в `ChatMessage` — `dark:prose-invert` и явные `prose-strong` / `prose-li` / `prose-ol` → `text-foreground` (у `@tailwindcss/typography` иначе жирный текст в списках остаётся «светлотемным» и сливается с фоном). |
| `src/utils/stripHelpDoctorSection.ts` | `stripHelpDoctorSection` — удаляет из отображаемого текста всё от строки-заголовка секции «к врачу» до конца; `shouldShowHelpDoctorReminder` — хеш id сообщения для показа мягкой строки. |
| `src/components/help/HelpDoctorReminderLine.tsx` | Одна строка вторичного стиля: напоминание про консультацию + ссылка «Когда обращаться к врачу» → `/sos?scenario=urgent_help`. |
| `src/components/chat/ChatMessage.tsx` | В режиме `forcePlainText` (вкладка «Чат», режим help): та же логика отрезания секции «к врачу» и редкой мягкой строки, без карточки `HelpWarningCard`. |
| `src/utils/scheduleScrollContainerToBottom.ts` | Отложенная прокрутка контейнера сообщений к низу (двойной rAF + `setTimeout` 0 и 80ms) — стабильно после новых сообщений и при появлении клавиатуры Android. |
| `src/utils/textareaAutosize.ts` | Общая автовысота textarea (clamp по max px, `overflow-y` hidden / auto). Используют `ChatInputBar` и `TopicConsultationSheet`. |
| `src/data/helpTopicChips.ts` | Quick chips для topic `"quick"`: **`access` и порядок как на главной** — сначала все `free` (Не хочет есть, Когда срочно к врачу), затем все `paid` (Новый продукт → … → Наша тарелка). Экспорт: `getPremiumQuickChipTexts()`, `isPremiumQuickChipText(text)`. |
| `src/features/help/config/popularQuestions.ts` | Пул «Сегодня спрашивают»: у **Free** в ротации только вопросы с `access: "free"` (сценарии «не ест» / срочно к врачу и близкие формулировки); остальные помечены `premium`. Тап по premium при `!hasAccess` на главной Help открывает paywall без sheet. |
| `src/hooks/useDeepSeekAPI.tsx` | Запрос к `deepseek-chat`. При 429 и `code === 'LIMIT_REACHED'` или `error === 'LIMIT_REACHED'` бросает `Error('LIMIT_REACHED')` (payload опционален). При успешном ответе help — вызывает `refetchUsage()`. |
| `src/hooks/useSubscription.tsx` | `helpRemaining`, `helpLimitExceeded` из `get_usage_count_today(..., "help")` и `limits.helpDailyLimit`. `refetchUsage()` инвалидирует запросы `["usage-help-today", user?.id]` и др. |

---

## 2. Hero: placeholder, подсказка (дисклеймер — внизу страницы)

- **Заголовок:** «Помощь маме»; подзаголовок: «Что происходит с ребёнком?».
- **Placeholder поля ввода:** «Например: ребёнок стал хуже есть».
- **Дисклеймер:** в Hero не отображается; перенесён в самый низ страницы Help (SosTiles), после всех секций карточек — малозаметный сервисный текст «Ответы носят информационный характер и не заменяют консультацию врача.» (text-[11px], text-muted-foreground/90, по центру).
- **Файл:** `SosHero.tsx` (hero), `SosTiles.tsx` (дисклеймер внизу).

---

## 3. Quick chips (Hero и chat sheet)

- **Данные:** `helpTopicChips.ts` — массив с `access: "free" \| "paid"`. **Порядок монетизации:** сначала оба free-чипа, затем все premium в фиксированном списке (см. файл).
- **Hero:** при тапе по premium-чипу у Free → **только** `onPremiumChipTap()` (paywall), без открытия sheet. Free-чипы → `onOpenWithMessage(chip.text)`.
- **SosTiles:** открытие sheet с произвольным текстом из поля ввода по-прежнему возможно; превью для «случайно введённого» premium-текста в quick-sheet — прежняя логика sheet (если текст совпал с premium-чипом).
- **TopicConsultationSheet** (topic `quick`): сортировка чипсов — free первыми; тап по premium без доступа → `onPremiumChipTap` (paywall).

---

## 4. Блок «Сегодня спрашивают» (вторичный, ниже Hero)

- **Расположение:** ниже Hero («Помощь маме»); визуально не конкурирует с ним — компактный, неакцентный.
- **Вопрос дня:** `getPopularQuestionForToday({ hasAccess })`. Ротация раз в день, детерминирована по дате; категория по дню недели; внутри категории — по дню года. Free в блоке видит только вопросы с `access: "free"`; при смене доступа или тестах возможен premium-вопрос.
- **Клик:** при `!hasAccess && popularQuestion.access === "premium"` — открывается paywall; иначе `handleOpenWithMessage(popularQuestion.text)`.
- **Лимит:** при `helpLimitExceeded` кнопка блока `disabled`.
- **Вёрстка:** компактный информационный блок (rounded-xl, border border-border/80, bg-muted/20), заголовок «Сегодня спрашивают» (text-[11px], uppercase), текст вопроса: `text-sm text-foreground/90`, `line-clamp-2`; без тяжёлой карточки и акцентной иконки.
- **Передача в sheet:** при `!hasAccess && popularQuestion.access === "premium"` в sheet передаётся `popularQuestionTextIfPremium: popularQuestion.text` для отображения preview.

---

## 4.1. Карточки тем (SosTopicGrid) и секции главной

- **Секции:** не фильтры «Питание/Малыш», а две группы из `getHelpMonetizationSections()`: **«Популярные вопросы»** (`food_refusal`, `urgent_help`) и **«Разбор ситуаций»** (остальные темы).
- **Иконки:** **IconBadge** + поля `icon` / `badgeVariant` в `sosTopics.ts`.
- **Premium для Free:** бейдж Lock + Star + «Premium», слегка приглушённая карточка; клик → paywall (sheet темы не открывается).
- **Подписчики:** без бейджей, обычный вид; клик открывает sheet сценария.

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

## 7. Sheet: автоскролл ленты и autosize поля ввода

- **Скролл:** контейнер списка сообщений — `overflow-y-auto`; после отправки пользователем выставляется флаг «держаться у низа»; при прокрутке вверх дальше порога (~120px от низа, как в `ChatPage`) флаг сбрасывается — чтение истории без принудительного скролла. Пока флаг активен, после изменений `messages` / `isSending` вызывается `scheduleScrollContainerToBottom` (`scrollTop = scrollHeight - clientHeight` с отложенными проходами).
- **Поле ввода:** `applyTextareaAutosize` + `TEXTAREA_AUTOSIZE_DEFAULT_MAX_PX` (120) — совпадает с нижней панелью вкладки «Чат»; пересчёт в `useLayoutEffect` при изменении `input` и на `onInput` (в т.ч. после вставки текста с чипсы).

### 7.1 Секция «к врачу» в ответе модели (только UI)

- Промпт SOS по-прежнему просит структуру с п.3 «К врачу если»; **генерация на бэкенде не менялась**.
- На клиенте заголовок и весь текст после него **не показываются** (список «красных флагов» из ответа пользователю не выводится).
- Вместо отдельного предупреждающего блока с иконкой — у примерно половины сообщений внизу добавляется **спокойная** строка `text-muted-foreground` со ссылкой на тему **«Когда срочно обращаться к врачу?»** (`urgent_help`, маршрут `/sos?scenario=urgent_help`); подпись ссылки в UI: «Когда обращаться к врачу».

---

## 8. Расширение

- **Тексты и чипсы:** правки в `helpTopicChips.ts` и в `popularQuestions.ts`.
- **Категории дня / ротация:** правки в `popularQuestions.ts` (`CATEGORY_BY_DAY_OF_WEEK`, логика в `getPopularQuestionForToday`).
- **Ротация из аналитики или бэкенда:** заменить/обернуть `getPopularQuestionForToday` (например возвращать вопрос из API), UI менять не требуется.
- **Новые темы/чипсы:** добавить элементы в соответствующие массивы с полем `access` при необходимости.
