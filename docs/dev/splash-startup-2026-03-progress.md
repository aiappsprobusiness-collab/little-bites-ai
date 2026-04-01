# Splash при старте (март 2026) — отчёт

## Причина двух разных экранов

1. **Стили branded splash жили только в `splash.css`**, который подключается из `main.tsx`. Пока не выполнился бандл, `#splash-screen` в DOM был без размеров и фона — под ним был виден фон документа / WebView.
2. **Анимация `splashFadeIn`** в CSS начиналась с `opacity: 0` на ~0.5 с: даже после загрузки JS пользователь сначала «просвечивал» фон, а не картинку splash.
3. **Системный splash Capacitor Android** (`androidSplashResourceName: "splash"`) по умолчанию собирается из иконки/шаблона и визуально не совпадает с полноэкранным `/splash/splash-screen.png`, если не обновить ассеты через `@capacitor/assets`.
4. **`theme-color` / оливковый акцент** на старте мог усиливать ощущение «зелёного экрана» до появления полноценного фона.

## Что изменено

- В **`index.html`** добавлены inline-стили для `html/body` и `#splash-screen`, **preload** фона `/splash/splash-screen.png`, метка времени `window.__momRecipesSplashStartMs` для единого отсчёта длительности.
- Убрана анимация появления с нулевой прозрачности; **`src/styles/splash.css`** дублирует правила после загрузки бандла (комментарий про синхронизацию с `index.html`).
- В **`main.tsx`**: скрытие splash только после **`window.load`** и не раньше **2800 ms** с момента inline-метки; плавный fade-out **400 ms**.
- **`capacitor.config.ts` / `.json`**: параметры SplashScreen для **опциональных** нативных сборок; **основной канал — PWA** (без `cap sync`). Старт для пользователей с сайта: `index.html` + `main.tsx` + manifest; см. **`docs/dev/STARTUP_UI_AND_PLAN_LOADING.md`**.
- **`public/manifest.json`**: `theme_color` приведён к **`#E8F1EC`** (как фон splash), чтобы PWA/Chrome не контрастировали с брендированным первым кадром.
- **`public/sw.js`**: в precache добавлен **`/splash/splash-screen.png`** для повторных запусков с активным SW.

## Source of truth

| Что | Где |
|-----|-----|
| Первый кадр (до JS) | `index.html` — `<style>` + `#splash-screen`, `preload` изображения |
| Те же правила после бандла | `src/styles/splash.css` (должен совпадать с inline) |
| Минимальная длительность и fade-out | `src/main.tsx` — `SPLASH_MIN_VISIBLE_MS`, `SPLASH_FADE_OUT_MS`, `window.__momRecipesSplashStartMs` |
| Установленная PWA (Chrome / Safari) | `public/manifest.json` → `background_color` / `theme_color` / `icons`; `index.html` → `theme-color`, splash overlay |
| Опционально: Capacitor | `capacitor.config.*` + нативные ассеты (не обязательно для PWA с домашнего экрана) |
| PWA meta | `index.html` → `theme-color`, `public/manifest.json` → `background_color` / `theme_color` |

Подробнее: **`docs/dev/PWA_ICONS_AND_SPLASH.md`**, **`docs/dev/STARTUP_UI_AND_PLAN_LOADING.md`**.

## Как проверить

- Холодный старт на Android (WebView / установленная PWA).
- Повторный запуск, возврат из фона.
- Установленная PWA: нет серого/пустого кадра до полноэкранного фона; splash удерживается ~2.8–3.2 с (load + fade).
- В Chrome DevTools: Slow 3G — splash остаётся до `load`, без преждевременного исчезновения.

## Чеклист приёмки

- [ ] Cold start Android — сразу branded splash, без промежуточного «пустого» экрана.
- [ ] Повторный запуск — то же поведение.
- [ ] После сворачивания/разворачивания — без артефактов.
- [ ] Установленная PWA — согласованный фон/тема на старте.
- [ ] Нет серого промежуточного экрана между системным и HTML-splash (при необходимости выровнять drawable Capacitor под `splash-screen.png`).
- [ ] Branded splash виден ~2.5–3 с.
- [ ] Переход в приложение плавный (fade ~400 ms), без двойного показа.
