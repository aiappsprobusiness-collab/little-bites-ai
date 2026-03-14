# Android: конфликты браузер / PWA / Service Worker / Auth Storage

**Дата:** 2025-03-14  
**Цель:** Устранить поломки логина на Android в обычном режиме (при работающем инкогнито), не ухудшая PWA UX и не ломая установку на рабочий стол.

---

## 1. Симптомы

- В **инкогнито** авторизация работает.
- В **обычном режиме** на Android возможны:
  - поломки логина;
  - приложение видит пользователя как нового/пустого.

Инкогнито не использует постоянный localStorage/sessionStorage между сессиями и не держит старый Service Worker в том же виде, что и обычный профиль — поэтому конфликты (stale storage, старый SW, «призрак» прошлого пользователя) проявляются в обычном режиме.

---

## 2. Service Worker и PWA

### 2.1. Где регистрируется SW

- **Файл:** `src/main.tsx` (строки 36–71).
- **Условие:** только в production (`import.meta.env.PROD`) и при наличии `navigator.serviceWorker`.
- **Событие:** `window.addEventListener("load", …)`.
- **Вызов:** `navigator.serviceWorker.register("/sw.js", { scope: "/" })`.
- **Результат:** сохраняется в `window.__swRegistration`.

### 2.2. Как обновляется SW

- В **`vite.config.ts`** плагин `swVersionPlugin()` при сборке подставляет в `dist/sw.js` плейсхолдер `__APP_BUILD_VERSION__` на версию вида `gitHash-timestamp`. Таким образом содержимое `sw.js` меняется при каждом production build.
- В **`public/sw.js`** константа `CACHE_VERSION = "__APP_BUILD_VERSION__"` используется для имён кэшей; после билда там реальная версия — браузер видит новый скрипт и может установить новый worker.
- **Обновление не автоматическое:** новый worker переходит в `waiting`. При `reg.waiting && navigator.serviceWorker.controller` диспатчится `sw-update-available`. Компонент **`PWAUpdateToast`** показывает toast «Доступна новая версия» с кнопкой «Обновить»; по нажатию в waiting worker отправляется `SKIP_WAITING`, затем выполняется перезагрузка.
- Раз в час вызывается `reg.update()` для проверки обновления.
- **Риск stale SW:** без версионирования `sw.js` (исправлено ранее) старый SW мог держать старый бандл. С текущим версионированием после деплоя браузер получает новый `sw.js` и появляется новый worker; пользователь видит toast и после «Обновить» получает актуальный фронт.

**Итог:** ситуация «старый SW держит старый bundle» устранена версионированием в `vite.config.ts` и не перехватом `sw.js`/`manifest.json` в SW (всегда сеть).

---

## 3. Ключи storage (auth, app state, legacy)

### 3.1. Supabase Auth

- **Где задаётся:** `src/integrations/supabase/client.ts`: `createClient(…, { auth: { storage: localStorage, … } })`.
- **Ключи:** формат Supabase v2 — `sb-<project_ref>-auth-token` (или аналог с reference id). Очищаются только вызовом `supabase.auth.signOut()`; приложение их не трогает.

### 3.2. Сессия приложения (одна активная сессия на аккаунт)

| Ключ | Хранилище | Назначение |
|------|-----------|------------|
| `lb_active_session_key` | localStorage | Ключ активной сессии устройства; при входе с другого устройства старое разлогинивается. Очищается при logout. |
| `lb_session_invalid_reason` | sessionStorage | Причина принудительного выхода (показ на /auth). Читается и очищается при отображении. |

### 3.3. Семья / профиль (риск «призрака» после смены пользователя)

| Ключ | Назначение | При logout |
|------|------------|------------|
| `selectedMemberId` | Выбранный член семьи / «family». | **Очищается** (новый пользователь не должен видеть выбор прошлого). |
| `primaryMemberId` | Primary member для Free. | **Очищается**. |

### 3.4. Чат и подсказки

| Ключ | Назначение | При logout |
|------|------------|------------|
| `help_chat_messages_v1` | Сообщения help-чата. | **Очищается** (чтобы не показывать чат прошлого пользователя). |
| `chat_hints_seen_v1` | Флаг «подсказки чата показаны». | **Очищается**. |
| `help_session:<memberId>:<topicKey>` | История по темам Help по члену и теме. | Не очищается глобально; ключ привязан к memberId, при смене пользователя новые members другие. При необходимости можно добавить очистку по префиксу `help_session:`. |

### 3.5. Кэш рецептов и планы

| Ключ/префикс | Назначение | При logout |
|--------------|------------|------------|
| `recipe:<id>` | Кэш рецептов (снижение egress). | Не очищается; ключ по id рецепта, не по пользователю. |
| `plan_job:<userId>:<memberId>:<startKey>` | Id последнего job генерации плана. | Не очищается; ключ содержит userId, при новом пользователе не совпадёт. |

### 3.6. Onboarding, A2HS, напоминания, прочее

| Ключ | Назначение |
|------|------------|
| `onboarding_attribution` | Attribution онбординга. |
| `a2hs_*` | Счётчики/флаги установки PWA (attempt_count, dismissed_forever, trigger_source, first_day/week/recipe dispatched и т.д.). |
| `dinner_reminder_enabled`, `dinner_reminder_shown_date` | Напоминание об ужине. |
| `mealPlan_mutedWeekKey` | Скрытая неделя в плане. |
| `little-bites-app-store` | Zustand persist (например версия). |
| `mr_anon_id`, `last_touch_*`, `last_touch_entry_point` и т.д. | Аналитика/usage (usageEvents). |
| `mealSwap_free` | Замена приёма (free tier). |
| `debug_plan_enabled`, `DEBUG_PLAN` | Только dev, дебаг плана. |
| `justCreatedMemberId` | sessionStorage, «только что созданный член» (planFill). |

Эти ключи не очищаются при logout (не привязаны к одному пользователю так, чтобы ломать новый логин).

### 3.7. Legacy (одноразовая очистка при старте)

- **Где:** `src/App.tsx`, компонент `LegacyCacheClear`.
- **Ключи:** `child_id`, `last_child`, `user_usage_data`, `recipe_cache` (старый единый ключ; текущий кэш — по ключам `recipe:<id>`).
- Очищаются только эти ключи, **без** touch к `sb-*-auth-token`.

---

## 4. Потенциальные конфликты

1. **Stale selectedMemberId / primaryMemberId**  
   После выхода прошлого пользователя в localStorage оставались выбранный член и primary member. Новый пользователь при загрузке членов мог получить непустой `readStoredMemberId()` / `readStoredPrimaryMemberId()`, но эти id относятся к **другой семье** → пустой или некорректный UI («приложение видит пользователя как нового/пустого» или показывает чужие данные).

2. **Stale help-чат**  
   Сообщения help-чата хранились в одном ключе без привязки к user id; после смены пользователя новый пользователь мог видеть старые сообщения.

3. **Обычный браузер vs PWA**  
   Один и тот же origin: и вкладка браузера, и установленная PWA используют общий localStorage/sessionStorage для этого origin. Если пользователь залогинен в PWA и выходит в обычной вкладке (или наоборот), без очистки перечисленных ключей при logout в другой «контекст» (PWA или браузер) могли подставляться старые selectedMemberId/primaryMemberId/чат.

4. **Service Worker**  
   Старый SW мог отдавать закэшированный index.html/ассеты. С версионированием `sw.js` и network-first для навигации после обновления SW пользователь получает свежий контент; проблема «бесконечно старый бандл» устранена.

---

## 5. Что сделано

### 5.1. Очистка при logout

- **Файл:** `src/utils/authStorageCleanup.ts`.  
  Функция `clearOnLogout()` удаляет из localStorage ключи:
  - `selectedMemberId`
  - `primaryMemberId`
  - `help_chat_messages_v1`
  - `chat_hints_seen_v1`
- **Вызов:** в `src/hooks/useAuth.tsx` в `signOut()` перед `clearStoredSessionKey()` и `supabase.auth.signOut()` вызывается `clearOnLogout()`.
- **Не трогаем:** `sb-*-auth-token` (очищает Supabase), `lb_active_session_key` (очищается отдельно в useAuth), остальные ключи (onboarding, A2HS, кэш рецептов, plan_job и т.д.) — без точечной необходимости не очищаем, чтобы не ломать UX и не делать полную зачистку на каждый старт.

### 5.2. Legacy-очистка

- Уже реализована в `App.tsx` (`LegacyCacheClear`): при старте удаляются только `child_id`, `last_child`, `user_usage_data`, `recipe_cache`.
- В DEV при фактическом удалении хотя бы одного из этих ключей вызывается `logLegacyKeysCleared(removed)`.

### 5.3. Dev-only логирование

- **Файл:** `src/utils/storageDebug.ts`.
  - `logServiceWorkerState()` — состояние SW (controller, registration, active/waiting/installing), маркер сборки (development/production).
  - `logStorageSnapshot()` — по списку релевантных ключей выводится только наличие/отсутствие; ключи с `sb-*`/token не светят значения.
  - `logLegacyKeysCleared(keys)` — какие legacy-ключи были удалены при старте.
- **Вызов:** в `App.tsx` компонент `StorageAndSwDebug` по таймеру ~800 ms один раз вызывает `logStorageAndSwState()` (только в DEV). `logLegacyKeysCleared` вызывается из `LegacyCacheClear` при удалении ключей.

### 5.4. PWA и установка

- Логика установки (A2HS), toast обновления и регистрация SW не менялись. Полная очистка localStorage на каждый старт не добавлялась — только точечная при logout и существующая legacy-очистка.

---

## 6. Как проверить, что обычный режим на Android ведёт себя стабильно

1. **Обычный режим (Chrome Android):**  
   Войти → убедиться, что профиль/члены семьи/чат отображаются корректно. Выйти (Профиль → Выход). Снова войти (другой или тот же пользователь). Убедиться, что нет «пустого» или «чужого» выбранного члена семьи и что help-чат не показывает сообщения предыдущего пользователя.

2. **Инкогнито:**  
   Повторить сценарий вход → выход → вход. Поведение должно остаться таким же стабильным.

3. **PWA (установленное приложение):**  
   То же: вход → выход → вход. После выхода не должно быть stale selected member / help-чат при следующем входе.

4. **Переключение контекста:**  
   Залогиниться в PWA, выйти в обычной вкладке того же сайта (или наоборот). Войти снова в том контексте, где выходили. Ожидается корректный экран входа и после входа — актуальные данные пользователя без «призрака» прошлого.

5. **Dev-логи в консоли (только DEV):**  
   При загрузке приложения через ~800 ms в консоли должны появиться сообщения `[Storage/SW]` с состоянием SW и снимком ключей storage (без значений секретов). При наличии legacy-ключей при первом старте — сообщение об их очистке.

---

## 7. Краткая сводка

| Вопрос | Ответ |
|--------|--------|
| Где регистрируется SW? | `src/main.tsx`, по `load`, только PROD. |
| Как обновляется SW? | Версия в `sw.js` подставляется при билде; новый worker в waiting → toast «Обновить» → skipWaiting → reload. |
| Риск stale SW? | Снижен версионированием; `sw.js` и `manifest.json` не кэшируются SW. |
| Какие ключи очищаются при logout? | `selectedMemberId`, `primaryMemberId`, `help_chat_messages_v1`, `chat_hints_seen_v1` + уже ранее: `lb_active_session_key`; Supabase сам очищает `sb-*-auth-token`. |
| Legacy-очистка при старте? | Да, точечная: `child_id`, `last_child`, `user_usage_data`, `recipe_cache`. |
| Dev-логирование? | SW state, storage snapshot (без секретов), факт очистки legacy-ключей. |
| Конфликт браузер vs PWA? | Один origin → общий storage; при logout теперь очищаются ключи, дающие «призрак» прошлого пользователя, в обоих контекстах. |

Документация по PWA/обновлению SW и A2HS: `docs/audits/pwa_a2hs_update_diagnostic.md`.
