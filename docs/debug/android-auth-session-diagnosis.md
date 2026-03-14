# Диагностика auth/session на Android

Временный документ для отладки проблемы: на Android в обычном режиме браузера после логина приложение ведёт себя как пустое (предлагает создать ребёнка); в инкогнито и на iOS/Windows всё ок.

## 1. Где происходит auth bootstrap

### 1.1 Создание Supabase client

- **Файл:** `src/integrations/supabase/client.ts`
- **Поведение:** `createClient(URL, KEY, { auth: { storage: localStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })`
- **Важно:** Сессия хранится в **localStorage**. На Android PWA и обычная вкладка могут иметь разный контекст storage (разные «партиции»), из‑за чего возможен конфликт старой сессии / пустой сессии.

### 1.2 Чтение session / user и подписка onAuthStateChange

- **Файл:** `src/hooks/useAuth.tsx`
- **AuthProvider, useEffect (один раз при монтировании):**
  1. Вызывается `supabase.auth.getSession()` (асинхронно).
  2. Подписывается `supabase.auth.onAuthStateChange(_event, session)`.
  3. Обработчик `onAuthStateChange` **игнорируется**, пока `initializedRef.current === false` (т.е. пока не завершился первый `getSession()`).
  4. После ответа `getSession()`: `setSession(session)`, `setUser(session?.user ?? null)`, `setLoading(false)`, `initializedRef.current = true`.
- **Источник правды о «залогинен ли пользователь»:** первый ответ `getSession()`. Дальше обновления идут через `onAuthStateChange` (SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED и т.д.).
- **User:** везде берётся как `session?.user`; отдельного `getUser()` в коде нет.

### 1.3 Где решается, что пользователь залогинен

- **ProtectedRoute:** `src/components/auth/ProtectedRoute.tsx`  
  Пока `loading === true` — показывается лоадер. Если `!user` — редирект на `/auth`. Иначе рендер дочернего маршрута.
- **Итог:** пользователь считается залогиненным, если после завершения auth bootstrap `user !== null` (т.е. `getSession()` вернул сессию с `session.user`).

### 1.4 Загрузка profile / members / plan

- **Members:** `src/hooks/useMembers.tsx`  
  `useQuery({ queryKey: ["members", user?.id], queryFn: ..., enabled: !!user })`.  
  Запрос к `members` выполняется **только при наличии user**. Если `user === null`, запрос отключён, `data` по умолчанию `[]`, `isLoading` при отключённом запросе — false.
- **Profile (subscription):** `src/hooks/useSubscription.tsx`  
  Аналогично: `queryKey: ["profile-subscription", user?.id]`, `enabled: !!user`.
- **Plan:** загрузка плана питания завязана на `user` и выбранный member (см. `useMealPlans`, `usePlanGenerationJob`).

### 1.5 Где UI решает показывать пустое состояние / onboarding / «создайте ребёнка»

- **ChatPage:** `src/pages/ChatPage.tsx`  
  Условие показа **FamilyOnboarding** (онбординг «создайте ребёнка»):  
  `showChatOnboarding = !authLoading && !!user && !isLoadingMembers && members.length === 0`.
- **MealPlanPage:** `src/pages/MealPlanPage.tsx`  
  Условие показа блока «Нет профиля ребенка» / «Добавить ребенка»:  
  `showNoProfile = !authLoading && !!user && !isMembersLoading && members.length === 0`, затем при необходимости `showEmptyFamily = isFamilyMode && showNoProfile`.
- **Важно:** пока `isLoadingMembers === true` или `authLoading === true`, экран «создайте ребёнка» **не показывается** (показ только после явного завершения загрузки и пустого списка members).

---

## 2. Потенциальные race conditions

1. **Порядок событий при старте:**  
   `getSession()` асинхронный. До его завершения `loading === true`, `user === null`.  
   Если на Android `getSession()` долго выполняется или читает из «не того» storage, возможен сценарий: сначала приходит `onAuthStateChange` (например, INITIAL_SESSION с `session === null`), но он игнорируется из‑за `!initializedRef.current`. Решение о сессии принимается только по первому ответу `getSession()`. Гонки между `getSession` и `onAuthStateChange` частично сглажены (игнор событий до инициализации), но порядок «сначала getSession, потом подписка» не гарантирован: подписка регистрируется в том же эффекте сразу, поэтому событие INITIAL_SESSION может прийти до разрешения промиса `getSession()` — и будет проигнорировано. Итоговая гонка: **если getSession() на Android возвращает null или ошибку** (например, из‑за storage), то после `setLoading(false)` и `setUser(null)` пользователь уйдёт на `/auth`. Если же getSession() вернёт сессию, но запрос members из‑за таймингов или RLS вернёт пустой массив — тогда приложение покажет «создайте ребёнка».

2. **Members до auth:**  
   Запрос members включён только при `!!user`. Поэтому запросы profile/members/plan **не стартуют до появления user** в контексте. Но «появление user» зависит только от результата первого `getSession()`. Если на Android в storage лежит устаревшая или битая сессия, возможен сценарий: getSession возвращает сессию (user есть), а реальные запросы к API с этим токеном падают или возвращают пустые данные — тогда members = [] и показывается онбординг.

3. **Итог по гонкам:**  
   Основной риск не в том, что members/profile запрашиваются до auth, а в том, что **на Android результат getSession() или работа с localStorage может быть некорректной** (другая партиция storage, старый кэш, service worker, старый bundle).

---

## 3. Наиболее вероятные причины (по приоритету)

1. **Разделение storage на Android: PWA vs обычная вкладка**  
   - В PWA и в обычной вкладке Chrome на Android localStorage может быть разным.  
   - После логина в одной «среде» в другой при открытии приложения сессии нет (или наоборот — в одной среде осталась старая сессия).  
   - **Признак:** в инкогнито нет старых ключей — всё чисто, логин работает. В обычном режиме — смешение контекстов или старый ключ.

2. **Старая/битая сессия в localStorage**  
   - В storage остался устаревший или повреждённый `sb-*-auth-token`.  
   - Supabase при getSession() может вернуть null или сессию с невалидным токеном; последующие запросы (members, profile) тогда падают или возвращают пустое.  
   - **Признак:** в логах [AuthSession] getSession возвращает сессию с user, но members load done с count=0 и без ошибки (или с ошибкой RLS/сети).

3. **Service Worker / кэш старого bundle**  
   - Старая версия JS может по‑другому инициализировать auth или по‑другому обращаться к storage.  
   - **Признак:** после обновления приложения или сброса кэша проблема исчезает или меняется.

4. **Тайминги инициализации на Android**  
   - localStorage или Supabase client на первом тике ещё «не готовы».  
   - **Признак:** в логах getSession приходит с задержкой или с error; при повторной загрузке страницы иногда всё ок.

5. **active_session_key (profiles_v2)**  
   - В коде сейчас **не вызывается** `validateActiveSession` (есть только в документации/аудите). Поэтому разлогин из‑за несовпадения ключа сессии в этой диагностике не рассматривается как активная причина. Если позже добавят проверку при visibilitychange — возможен разлогин при переключении вкладки/PWA.

---

## 4. Что править в коде (конкретные места)

- **Не менять прод-логику шире необходимого.** Ниже — только то, что напрямую связано с диагностикой и устойчивостью к гонкам.

1. **Уже сделано (диагностика):**  
   - `src/utils/authSessionDebug.ts` — хелпер логов и снапшот для панели (только DEV).  
   - `src/components/debug/AuthDebugPanel.tsx` — компактный блок на экране в DEV.  
   - В `useAuth`: логирование результата getSession, onAuthStateChange (без полного токена).  
   - В `useMembers` / `useSubscription`: лог старта загрузки members/profile и завершения загрузки members.  
   - В ChatPage / MealPlanPage: логирование причины показа empty/onboarding; ужесточено условие показа: только при `!authLoading && !!user && !isLoadingMembers && members.length === 0`.

2. **Возможные следующие шаги (после снятия логов):**  
   - Рассмотреть на Android использование одного и того же контекста storage для PWA и браузера (если применимо) или явную очистку/миграцию ключей при смене «режима».  
   - При повторяющихся проблемах: повторный вызов getSession() или refreshSession() после первого рендера (с дебаунсом), чтобы перезаписать возможный «пустой» кэш.  
   - Документировать и при необходимости вызывать `validateActiveSession` только после полной загрузки profile (см. docs/audits/session_policy_redesign.md), чтобы не разлогинивать из‑за гонки с записью active_session_key.

---

## 5. Как воспроизвести проблему

1. Открыть приложение на **Android** в **обычном браузере** (Chrome), не в инкогнито.  
2. Залогиниться (email/пароль или magic link).  
3. Наблюдать: либо логин «ломается» (редирект на /auth, ошибка), либо после входа открывается экран с предложением создать ребёнка при том, что профили уже есть.  
4. Для сравнения: тот же сценарий в **инкогнито** на Android или на iOS/Windows — там всё ок.

---

## 6. Признаки, что проблема именно в storage / service worker / session conflict

- В **console** (DEV) в логах `[AuthSession]`:  
  - **getSession** возвращает `hasSession: false` или `sessionUserId: null` при только что выполненном логине в этой же вкладке.  
  - Или **getSession** возвращает сессию с user, но **members load done** с `count: 0` при реально существующих members в БД (тогда смотреть ошибки RLS/сети).  
- В **AuthDebugPanel** (DEV) внизу экрана:  
  - `session: no` или `user id: -` при ожидании залогиненного состояния.  
  - `members loaded: yes`, `members count: 0` при наличии профилей в БД — значит, проблема в запросе (RLS, токен, среда).  
- После **очистки site data** (Storage → Clear site data) для origin приложения на Android проблема исчезает или меняется.  
- В **инкогнито** на том же устройстве логин и отображение данных в норме — сильный намёк на старую сессию или разный storage в обычном режиме.

---

## 7. Временная debug-инфраструктура (только DEV)

- **Console:** логи с префиксом `[AuthSession]`: getSession result, onAuthStateChange, members/profile load start/done, причина empty/onboarding. Полный access_token не логируется, только факт наличия и превью (первые/последние 4 символа).  
- **Экран:** блок `[DEV] Auth/Session` внизу (AuthDebugPanel) с полями: auth ready, session exists, user id, email, is PWA, members loaded, members count, profile loaded, onboarding reason, empty state reason.  
- После локализации проблемы на Android эту диагностику можно отключить или убрать (оставив при необходимости только жёсткие условия показа empty state).
