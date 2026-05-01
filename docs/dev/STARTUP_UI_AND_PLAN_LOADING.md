# PWA: старт, splash и плавность UI (План / вкладки)

**Канал доставки продукта — установленная PWA** (добавление на домашний экран с сайта), в том числе на Android и iOS. Этот документ описывает **только web/PWA**-цепочку: manifest, HTML, SW, React, данные. Сборки APK/IPA и Capacitor **не являются** обязательной частью пользовательского сценария; см. раздел в конце.

При изменениях обновлять также **`docs/dev/PWA_ICONS_AND_SPLASH.md`**.

---

## A. PWA startup layer — source of truth

### Канонический полноэкранный splash

Единый брендированный «второй» кадр (полноэкранная картинка), который мы контролируем полностью:

| Что | Где |
|-----|-----|
| Изображение | `/splash/splash-screen.png` |
| Фон под картинкой | `#E8F1EC` |
| До выполнения JS | `index.html` — inline `<style>` на `html`/`body` и `#splash-screen`, `rel="preload"` картинки |
| После бандла | `src/styles/splash.css` (держать в синхроне с inline) |
| Скрытие | `src/main.tsx` — после `window.load`, не раньше ~2800 ms от `window.__momRecipesSplashStartMs`, затем fade-out ~400 ms |

### Manifest и метаданные (согласование с первым кадром)

| Поле / тег | Значение | Зачем |
|------------|----------|--------|
| `manifest.json` → `background_color`, `theme_color` | `#E8F1EC` | Системный **короткий** launch-кадр установленной PWA (иконка на фоне) визуально ближе к каноническому splash |
| `manifest.json` → `id` | `https://momrecipes.online/` | Стабильная идентичность приложения для браузера (обновления PWA) |
| `icons` | Отдельные записи `purpose: "any"` и `purpose: "maskable"` | Maskable — для Android-иконки; не смешивать с `any` в одной записи без необходимости |
| `index.html` → `theme-color` | `#E8F1EC` (+ варианты с `prefers-color-scheme`) | Статус-бар / chrome не контрастируют с splash |
| `apple-touch-icon` | `/icons/apple-touch-icon.png` | iOS «Add to Home Screen» |
| `lang` на `<html>` | `ru` | Язык документа |

**Важно:** полностью убрать системный launch-кадр браузера (иконка по центру) **нельзя** — это ограничение платформы. Он должен быть **максимально похож** на наш splash: тот же **фон #E8F1EC** и согласованные иконки.

### Service Worker

- `public/sw.js`: **`/` и `index.html` не в precache`** — навигация network-first, чтобы после деплоя не отдавался устаревший HTML без актуального inline-splash.
- Версия кэша подставляется при сборке (`vite.config.ts` → `__APP_BUILD_VERSION__` в `dist/sw.js`).
- Splash-картинка в precache — для быстрого второго визита; не заменяет свежий `index.html`.

### Отладка (`?perf=1`)

В `main.tsx`: логи момента commit корня React, rAF×2, планирование и старт fade HTML-splash. В `AuthProvider`: `[perf] auth bootstrap ready` при `loading === false`. На странице плана — см. `MealPlanPage` (`[perf]`).

---

## B. Frontend — первый React-кадр, auth, вкладки

| Точка | Правило |
|-------|---------|
| **RootRedirect** | Только `loading` из auth (без лишнего `mounted`). Фон загрузки **`#E8F1EC`**, не `gradient-hero`, чтобы после fade splash не было резкой смены фона. |
| **ProtectedRoute** | Тот же фон **`#E8F1EC`** на время `loading`. |
| **MobileLayout** | `motion.main` с **`initial={false}`** — без повторного fade-in всего `main` при каждом переключении вкладки/маршрута. |

Вкладки по-прежнему размонтируют страницы (React Router); убрана только **анимация контейнера** на каждый mount.

**Первый профиль ребёнка (онбординг с Профиля):** после сохранения первого ребёнка — сразу переход на вкладку «План» (`/meal-plan?memberId=…&date=…`), без полноэкранного оверлея на Профиле. На Плане показываются привычный layout, скелетон приёмов и строка статуса подбора; заполнение дня (`startFillDay` в `planFill.ts`) уходит в фон после редиректа. Повторное автооткрытие шторки блокировать через **`sessionStorage`** (`src/utils/profileFirstChildSessionBlock.ts`): **`useRef` сбрасывается при remount** (Strict Mode, быстрая навигация), из‑за этого эффекты снова видели «семья пустая» и вызывали `setShowMemberSheet(true)`. Флаг снимается, когда `members.length > 0`. Редирект на План после первого ребёнка — с короткой задержкой (**~450 ms**) после тоста «Профиль создан», чтобы тост успел показаться; **`startFillDay`** запускается сразу, без ожидания. Meta **`wasEmptyFamilyOnboarding`** — снимок **`members.length === 0` до `await createMember`** в **`ProfileEditSheet`**. Эффект deeplink **`?openCreateProfile=1`** должен уважать тот же блок и чистить query при блокировке; см. также `profileSheetDeepLink.ts` + тесты.

---

## C. Data — вкладка «План», смена дня

**Сетевой шум старта (Этап 1):** см. **`docs/dev/MEAL_PLAN_NETWORK_STAGE1.md`** — отложенные запросы для replace-`useRecipes`, shopping list в sheet, политика refetch для `plan_generation_jobs`.

**Недопустимо** при уже загруженных данных недели:

- full-screen skeleton на весь блок приёмов только из-за `isFetching` посуточного запроса;
- визуальный «reload» шапки, чипов дней и общего layout.

**Реализация:**

- Параллельно грузятся недельный `getMealPlans(start..end)` и посуточный `getMealPlansByDate`.
- Пока недельный запрос **не** `isSuccess` — список дня из посуточного запроса; скелетон блока приёмов: `showPlanMealsSkeleton = !isWeekPlansSuccess && (isLoading \|\| isFetching)`.
- После **успешного** ответа недели — **`planMealsForSelectedDay`** = срез `weekPlans` по `selectedDayKey` (включая пустой день); смена дня **не** включает полный скелетон из-за `isFetching` посуточного запроса. При ошибке недели UI остаётся на посуточных данных.

Продуктовая логика плана не меняется — только источник отображаемых данных и условие скелетона.

Тост **«План питания на сегодня готов»** при первом заходе после создания ребёнка (`justCreatedMemberId`): показывать только когда **`hasNoDishes === false`** (есть хотя бы один слот с `recipe_id`), а не только при снятии `showPlanMealsSkeleton` — иначе запросы недели/дня могут быть уже успешными, а `startFillDay` ещё дописывает строки.

---

## D. Backend / DB

Под эти UX-правила отдельных изменений БД не требуется.

---

## E. Что проверить вручную (PWA)

- Установленная PWA, cold/warm start (Android Chrome, iOS Safari).
- Нет ощущения «чужой фон → полноэкранный splash → приложение»; системный кадр максимально близок к `#E8F1EC`.
- Splash → `/` → редирект → План: без лишнего gradient boot.
- План: переключение дней без full-screen skeleton при уже загруженной неделе.
- Вкладки: без «провала» opacity на `main`.
- После деплоя: обновление SW, нет залипания на старом HTML без splash.

---

## F. Deploy (только фронт)

| Действие | Нужно |
|----------|--------|
| Commit + push (GitHub Pages / ваш CI) | Да |
| Новый билд (`npm run build`) | Да |
| Обновление `sw.js` в `dist` (версия подставляется автоматически) | Да, как часть билда |
| Миграции БД / Edge Functions | Нет |

---

## G. Capacitor / нативная оболочка (вне текущего канала)

Репозиторий может содержать `capacitor.config.*` для **опциональных** нативных сборок; **пользовательский сценарий PWA от этого не зависит**. Не требовать `cap sync`, Xcode/Android Studio для исправлений из этого документа. Если нативный канал снова станет основным — вынести отдельную инструкцию и синхронизировать drawable/splash с `splash-screen.png`.
