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
- В проекте maskable для Mom Recipes генерируется скриптом `npm run generate:maskable-icon` → `public/icons/mom-recipes-app-icon-512-maskable.png` (исходник: `mom-recipes-app-icon-1024.png` или `-512.png`, контент в 80% safe zone на фоне #E8F1EC). В manifest для `purpose: "maskable"` подключён этот файл.

## Splash

- **Первый экран (системный):** у Capacitor задаётся в `capacitor.config` (`backgroundColor: "#E8F1EC"`, при необходимости drawable). У PWA Chrome использует `background_color` и иконки из manifest.
- **Второй экран (кастомный):** HTML `#splash-screen` (пустой div), в `src/styles/splash.css` — полноэкранный фон через `background-image` и `background-size: cover` (картинка из `/splash/splash-screen.png`). Скрывается по событию `load` в `main.tsx` (задержка 400 ms + 250 ms fade).

Документация не является source-of-truth для архитектуры чата/БД; при изменении логики PWA/splash этот файл стоит обновить.
