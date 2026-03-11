# Вкладка «Помощник рядом»: реализация UX и лимитов

Документ описывает, **как реализованы** последние правки вкладки Help: дисклеймер, quick chips (Free/Premium), карточка «Сегодня спрашивают», лимит вопросов и paywall. Используется для поддержки и отладки.

**Связанный документ:** [help-tab-functionality-description-ru.md](../help-tab-functionality-description-ru.md) — общее описание функционала для пользователя и промптов.

---

## 1. Файлы и роли

| Файл | Назначение |
|------|------------|
| `src/pages/SosTiles.tsx` | Страница Help: hero, карточка «Сегодня спрашивают», список тем, sheet и paywall. Вызывает `handleOpenWithMessage(text)`, при лимите — `onLimitReached` (refetch + закрытие sheet + открытие paywall). |
| `src/components/sos/SosHero.tsx` | Hero: ввод, дисклеймер (без иконки, серый текст), quick chips. Для Free по тапу на premium‑чип вызывается `onPremiumChipTap` (paywall). |
| `src/components/help/TopicConsultationSheet.tsx` | Нижний sheet с чатом по теме: чипсы (Free сначала, premium с маркером ⭐), input, история, retry. Fail‑safe: при отправке текста из `premiumChipTexts` у Free — не отправлять, открыть paywall. При `LIMIT_REACHED` — показать текст лимита в чате и вызвать `onLimitReached`. |
| `src/data/helpTopicChips.ts` | Quick chips для topic `"quick"`: список с полями `label`, `text`, `access: "free" \| "paid"`. Порядок: сначала Free, потом Premium. Экспорт: `getPremiumQuickChipTexts()`, `isPremiumQuickChipText(text)` для fail‑safe и перехвата на hero. |
| `src/features/help/config/popularQuestions.ts` | Пул популярных вопросов для «Сегодня спрашивают»: тип `PopularQuestion` (id, text, category, access). Функция `getPopularQuestionForToday({ hasAccess, date? })`: ротация 1 раз в день по категории дня (Пн=nutrition, Вт=baby, Ср=allergy, Чт/Вс=routine, Пт=nutrition, Сб=baby) и индексу дня в году. Free видит только вопросы с `access: "free"`. |
| `src/hooks/useDeepSeekAPI.tsx` | Запрос к `deepseek-chat`. При 429 и `code === 'LIMIT_REACHED'` или `error === 'LIMIT_REACHED'` бросает `Error('LIMIT_REACHED')` (payload опционален). При успешном ответе help — вызывает `refetchUsage()`. |
| `src/hooks/useSubscription.tsx` | `helpRemaining`, `helpLimitExceeded` из `get_usage_count_today(..., "help")` и `limits.helpDailyLimit`. `refetchUsage()` инвалидирует запросы `["usage-help-today", user?.id]` и др. |

---

## 2. Дисклеймер под полем ввода (Hero)

- **Текст:** «Ответы носят информационный характер и не заменяют консультацию врача.»
- **Стиль:** без иконки, мелкий шрифт (`text-[11px]`), цвет `text-muted-foreground/90`.
- **Файл:** `SosHero.tsx`.

---

## 3. Quick chips (Hero и chat sheet)

- **Данные:** `helpTopicChips.ts` — массив с `access: "free" \| "paid"`. Free‑чипы: «Новый продукт», «Стул малыша»; остальные — paid.
- **Hero:** при тапе по чипу: если `access === "paid"` и `!hasAccess` → `onPremiumChipTap()` (paywall), иначе `onOpenWithMessage(chip.text)`. Premium‑чипы для Free отображаются с маркером ⭐ и лёгким amber‑стилем.
- **SosTiles:** при вызове `handleOpenWithMessage(text)` если `!hasAccess && isPremiumQuickChipText(text)` → открыть paywall и не открывать sheet.
- **TopicConsultationSheet:** при тапе по чипу: если `access === "paid"` и `!hasAccess` → `onPremiumChipTap()`, иначе вставка текста в input. Fail‑safe в `sendMessage`: для topic `"quick"` если текст входит в `premiumChipTexts` и `!hasAccess` → вызвать `onPremiumChipTap()` и не отправлять запрос.
- **Порядок чипсов:** сначала Free, потом Premium (в данных и при отрисовке в sheet через сортировку).

---

## 4. Карточка «Сегодня спрашивают»

- **Вопрос дня:** `getPopularQuestionForToday({ hasAccess })`. Ротация раз в день, детерминирована по дате; категория по дню недели; внутри категории — по дню года. Free видит только вопросы с `access: "free"`.
- **Клик:** `handleOpenWithMessage(popularQuestion.text)` — тот же поток, что и для чипсов (при premium‑вопросе у Premium — обычная отправка; у Free в карточке показываются только free‑вопросы).
- **Лимит:** при `helpLimitExceeded` кнопка карточки `disabled`.
- **Стиль и место:** без изменений относительно прежней одной константы.

---

## 5. Лимит вопросов и paywall

- **Бэкенд (deepseek-chat):** для типа `sos_consultant` у Free проверяется `get_usage_count_today(..., "help")`; при `used >= 2` возвращается 429 с телом `{ code: "LIMIT_REACHED", payload: { feature: "help", limit, used } }`. После успешного ответа AI пишется событие в `usage_events` с `feature: "help"`.
- **Фронт при LIMIT_REACHED:** в `TopicConsultationSheet` в catch проверяется `msg === "LIMIT_REACHED"` → вызывается `onLimitReached()`, в чате показывается «Лимит на сегодня исчерпан. Попробуйте завтра или откройте Trial.» (не «Ошибка отправки»).
- **onLimitReached в SosTiles:** вызывается `refetchUsage()` (инвалидация запросов usage), выставляется кастомное сообщение paywall, затем `openPaywallFromSheet()` — закрытие sheet и открытие paywall, чтобы paywall был поверх экрана.

---

## 6. Почему счётчик не обновляется на 0 / почему снова «Ошибка»

### Счётчик не обновляется на 0 после исчерпания лимита

- **Как устроено:** при `LIMIT_REACHED` вызывается `refetchUsage()` — это только **инвалидация** запросов React Query (`usage-help-today` и др.). Refetch выполняется **асинхронно**. Данные обновляются после завершения refetch; до этого `helpRemaining` может ещё показывать старое значение (например 2).
- **Практически:** если пользователь быстро закрыл paywall и вернулся на вкладку Help, refetch мог не успеть завершиться — счётчик покажет старые данные. После повторного захода на вкладку или следующего открытия приложения данные уже обновлены.
- **Улучшение (при необходимости):** при закрытии paywall вызывать `refetchUsage()` ещё раз, чтобы при возврате на Help счётчик был актуальным; либо в `onLimitReached` дожидаться завершения refetch (например через `queryClient.refetchQueries`) перед открытием paywall.

### «Ошибка отправки» при вопросе из разрешённых для Free при не исчерпанном лимите

- В чате «Ошибка отправки. Попробуйте ещё раз.» показывается только когда в catch приходит **не** `LIMIT_REACHED` и **не** `HELP_TIMEOUT`. То есть это не обработка лимита, а любая другая ошибка запроса.
- **Возможные причины:**
  1. **Сеть:** обрыв, таймаут (для help 30 с), `Failed to fetch` — тогда пользователь видит либо «Ответ занимает больше времени…», либо «Соединение прервано…» в зависимости от типа ошибки; в части сценариев может уйти в общий fallback «Ошибка отправки» при нестандартном формате ошибки.
  2. **Ответ бэкенда не 429:** 500, 403, 429 с другим телом (без `code`/`error === 'LIMIT_REACHED'`) — в чате показывается общий текст «Ошибка отправки».
  3. **Ошибка парсинга 429:** если бэкенд вернул 429 с LIMIT_REACHED, но структура тела не та (например нет `code`/`error`), хук может выбросить другую ошибку и в чате будет «Ошибка отправки». Сейчас в useDeepSeekAPI учтены оба варианта: `code === 'LIMIT_REACHED'` и `error === 'LIMIT_REACHED'` (payload опционален).

Итого: при **разрешённом для Free** вопросе и **не исчерпанном** лимите появление «Ошибка отправки» говорит о проблеме запроса/сети/бэкенда, а не о логике Free/Premium или лимита. Лимит при этом обрабатывается отдельно (LIMIT_REACHED → текст про лимит и paywall).

---

## 7. Расширение

- **Тексты и чипсы:** правки в `helpTopicChips.ts` и в `popularQuestions.ts`.
- **Категории дня / ротация:** правки в `popularQuestions.ts` (`CATEGORY_BY_DAY_OF_WEEK`, логика в `getPopularQuestionForToday`).
- **Ротация из аналитики или бэкенда:** заменить/обернуть `getPopularQuestionForToday` (например возвращать вопрос из API), UI менять не требуется.
- **Новые темы/чипсы:** добавить элементы в соответствующие массивы с полем `access` при необходимости.
