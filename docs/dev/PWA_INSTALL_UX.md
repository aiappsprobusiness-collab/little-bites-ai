# PWA: предложение установить приложение (A2HS)

**Канал продукта:** установленная PWA с сайта (`docs/dev/STARTUP_UI_AND_PLAN_LOADING.md`).  
**Связанный аудит:** `docs/audits/pwa_a2hs_update_diagnostic.md` (историческая диагностика).

## Где в коде

| Часть | Файлы |
|--------|--------|
| Захват `beforeinstallprompt` | `src/main.tsx` → `window.__beforeInstallPromptEvent`, событие `a2hs-prompt-available` |
| Правила показа модалки | `src/hooks/usePWAInstall.ts` |
| Тайминги и очередь относительно тостов/trial | `src/utils/a2hsTiming.ts` |
| Диспатч триггеров с плана | `src/utils/a2hsEvents.ts`, `src/pages/MealPlanPage.tsx` |
| Рецепты в чате | `src/pages/ChatPage.tsx` |
| UI модалки | `src/components/pwa/PWAInstall.tsx` → `PwaInstallSheet.tsx`, `PwaInstallInstructions.tsx` |
| Тексты по триггеру | `src/utils/pwaInstallCopy.ts` |
| Ручная установка | `src/pages/ProfilePage.tsx` → «Установить приложение» (тот же `PwaInstallSheet`, `variant="help"`) |

## UI (визуал)

- **Паттерн:** bottom sheet снизу на мобилке (Framer Motion), по центру на `sm+` — как `PostValueTrialPromptModal` / paywall.
- **Стили:** `PAYWALL_OVERLAY`, `PAYWALL_MODAL_CARD`, `PAYWALL_MODAL_SCROLL_TINT`, `PAYWALL_PRIMARY_CTA` из `src/utils/paywallBrandStyles.ts`.
- **z-index:** `57` (между post-value trial `56` и trial lifecycle `58`).
- **Без** shadcn `Dialog` и иконки Puzzle; иконка приложения в оливковой обёртке.
- iOS / Android без `beforeinstallprompt`: пошаговый блок `PwaInstallInstructions`.

## Когда показываем авто-модалку

Только для **авторизованного** пользователя в **браузере** (не `standalone` / не уже установлено).

**Триггеры (один раз на аккаунт, `a2hs_trigger_source` в localStorage):**

| Событие | Источник |
|---------|----------|
| Первый день плана | `planJob` done **или** онбординг `startFillDay` + тост «План на день готов» (`justCreatedMemberId`) |
| Первая неделя плана | `planJob` done, тип `week` |
| Первый / второй рецепт в чате | `ChatPage.tsx` |

Legacy-событие `A2HS_EVENT_AFTER_FIRST_PLAN` слушается, но **не диспатчится** из UI.

## Тайминг (без наложения на тосты и trial)

На экране плана после готовности меню:

| UI | Задержка от момента «готово» |
|----|------------------------------|
| Тост «План на день/неделю готов» | **0 с**, длительность **5 с** (`PLAN_READY_TOAST_DURATION_MS`) |
| Модалка trial (Free, первый успех) | **3,5 с** (`POST_VALUE_TRIAL_PLAN_PAGE_DELAY_MS`) |
| Модалка «Установите на экран» | **5,8 с** (5 с тост + 0,8 с пауза), затем показ |

Если в момент показа открыты paywall / post-value trial / trial activated / Free vs Premium — установка **откладывается** с шагом **1,5 с**, до **12** попыток (~18 с дополнительно), чтобы не перекрывать trial.

Рецепт в чате: задержка **4 с** (отдельно от тоста плана).

Константы: `src/utils/a2hsTiming.ts`.

## Android без `beforeinstallprompt`

Слушатели A2HS **всегда** активны в браузере (не только при `deferredPrompt`). В модалке — текст про меню браузера «Установить приложение» / «На главный экран». Нативная кнопка «Установить» — только при наличии `beforeinstallprompt`.

## iOS

`beforeinstallprompt` нет. Модалка с инструкцией «Поделиться → На экран Домой»; то же в профиле.

## Suppression (localStorage)

| Ключ | Назначение |
|------|------------|
| `a2hs_attempt_count` | Сколько раз нажали «Позже» |
| `a2hs_next_eligible_at` | Cooldown 3 / 7 дней |
| `a2hs_dismissed_forever` | После 3× «Позже» или успешной установки |
| `a2hs_trigger_source` | Уже использованный триггер (`plan` \| `recipe` \| `day` \| `week`) |
| `a2hs_first_day_dispatched` / `a2hs_first_week_dispatched` | Однократный диспатч с плана |

## Онбординг

Создание первого ребёнка → `startFillDay` → `/meal-plan` → тост «План на день готов» → `dispatchA2HSFirstDayOnce()` → модалка установки **после** тоста (и после trial, если он открыт).

Отдельного шага «установите приложение» в `FamilyOnboarding` / welcome **нет** — только ценностный триггер после меню.
