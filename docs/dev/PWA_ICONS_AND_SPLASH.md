# PWA: иконки приложения и splash screen

Краткий справочник по тому, что за что отвечает, и рекомендации по иконкам/splash.

## Ответственные файлы

| Назначение | Файлы |
|------------|--------|
| **Иконка приложения (PWA/Android)** | `public/manifest.json` → `icons[]` |
| **Favicon / иконка вкладки** | `index.html` → `link rel="icon"` |
| **Apple Touch Icon (iOS)** | `index.html` → `link rel="apple-touch-icon"` |
| **Цвет темы (полоска в Android Chrome)** | `index.html` → `meta name="theme-color"`, `manifest.json` → `theme_color` |
| **Системный splash (Capacitor Android)** | `capacitor.config.ts` / `capacitor.config.json` → `plugins.SplashScreen` |
| **Кастомный splash (HTML)** | `index.html` → `#splash-screen`, `src/styles/splash.css`, `src/main.tsx` (скрытие по `load`) |

## Maskable-иконка (Android)

На Android при добавлении на главный экран используется **maskable**-иконка: система накладывает маску (круг/сквиркл). Если контент иконки доходит до краёв или смещён, иконка выглядит «срезанной» или смещённой.

- **Safe zone:** центральные 80% (радиус 40% от минимальной стороны). Весь важный контент должен быть внутри.
- В `manifest.json` для `purpose: "maskable"` лучше использовать отдельный PNG с отступами (контент в центре 80%), а не ту же картинку, что и для `purpose: "any"`.
- Проверка: [maskable.app](https://maskable.app/).
- В проекте скрипт `scripts/generate-png-icons.mjs` генерирует `icon-512-maskable.png` с safe zone из `public/icon-source.png`. Для иконок Mom Recipes из `public/icons/` можно подготовить отдельный maskable-вариант (например, уменьшить до 80% и центрировать на 512×512) и добавить его в `manifest.json` для `purpose: "maskable"`.

## Splash

- **Первый экран (системный):** у Capacitor задаётся в `capacitor.config` (`backgroundColor`, при необходимости drawable). У PWA в браузере Chrome использует `background_color` и иконки из manifest.
- **Второй экран (кастомный):** HTML `#splash-screen` с полноэкранной картинкой (`object-fit: contain`/`cover`), скрывается по событию `load` в `main.tsx`.

Документация не является source-of-truth для архитектуры чата/БД; при изменении логики PWA/splash этот файл стоит обновить.
