# PWA: иконки приложения и splash screen

Краткий справочник по тому, что за что отвечает, и рекомендации по иконкам/splash.

## Ответственные файлы

| Назначение | Файлы |
|------------|--------|
| **Иконка приложения (PWA/Android)** | `public/manifest.json` → `icons[]` |
| **Favicon / иконка вкладки** | `index.html` → `link rel="icon"` |
| **Apple Touch Icon (iOS)** | `index.html` → `link rel="apple-touch-icon"` |
| **Цвет темы (статус-бар / PWA chrome)** | `index.html` → `meta name="theme-color"`, `manifest.json` → `theme_color` (на старте совпадают с фоном splash `#E8F1EC`) |
| **Системный кадр установленной PWA (браузер)** | Краткий экран из **`manifest.json`**: `background_color`, `theme_color`, иконки. Должен совпадать по фону с каноническим splash (`#E8F1EC`). Полностью убрать нельзя — только выровнять. |
| **Опционально: Capacitor** | `capacitor.config.*` — только если собираете APK/IPA; **не** часть основного PWA-канала. |
| **Кастомный splash (HTML)** | Только **установленная PWA** (standalone). `index.html` → `data-pwa-splash`, `#splash-screen`, `preload`; `src/styles/splash.css`; `src/main.tsx` — скрытие после `window.load`, минимум ~2800 ms, fade ~400 ms. В вкладке браузера splash **нет**. |

Полная схема **PWA**-старта, загрузочные экраны и План: **`docs/dev/STARTUP_UI_AND_PLAN_LOADING.md`**.

## Maskable-иконка (Android)

На Android при добавлении на главный экран используется **maskable**-иконка: система накладывает маску (круг/сквиркл). Если контент иконки доходит до краёв или смещён, иконка выглядит «срезанной» или смещённой.

- **Safe zone:** центральные 80% (радиус 40% от минимальной стороны). Весь важный контент должен быть внутри.
- В `manifest.json` для `purpose: "maskable"` лучше использовать отдельный PNG с отступами (контент в центре 80%), а не ту же картинку, что и для `purpose: "any"`.
- Проверка: [maskable.app](https://maskable.app/).
- В проекте maskable для Mom Recipes генерируется скриптом `npm run generate:maskable-icon` → `public/icons/mom-recipes-app-icon-512-maskable.png` (исходник: `mom-recipes-app-icon-1024.png` или `-512.png`, контент в 80% safe zone на фоне #E8F1EC). В manifest для `purpose: "maskable"` подключён этот файл.

## Splash

- **Первый экран (браузер / ОС для PWA):** до показа страницы установленная PWA может показать **короткий** кадр «иконка на фоне» из manifest. Фон **`background_color` / `theme_color` = `#E8F1EC`**, иконки — maskable/any как в таблице выше. Для **нативной** оболочки (Capacitor) — отдельно `capacitor.config` и ассеты; это не требуется для установки с сайта.
- **Второй экран (кастомный):** только при запуске **с домашнего экрана** (standalone). Полноэкранный фон `/splash/splash-screen.png` в `index.html` (inline CSS под `html[data-pwa-splash]`). В обычном браузере — сразу фон лендинга (`#fafaf7` / dark), без картинки splash. Скрытие в PWA: `main.tsx`, **2800 ms** + fade **400 ms**. Чеклист: `docs/dev/splash-startup-2026-03-progress.md`.

Документация не является source-of-truth для архитектуры чата/БД; при изменении логики PWA/splash этот файл стоит обновить.
