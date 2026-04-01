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
| **Кастомный splash (HTML)** | `index.html` → inline `<style>` + `#splash-screen` + `preload` картинки (первый кадр до JS); `src/styles/splash.css` — те же правила после бандла; `src/main.tsx` — скрытие после `window.load` и минимум ~2800 ms с момента `window.__momRecipesSplashStartMs`, fade-out ~400 ms |

Полная схема **PWA**-старта, загрузочные экраны и План: **`docs/dev/STARTUP_UI_AND_PLAN_LOADING.md`**.

## Maskable-иконка (Android)

На Android при добавлении на главный экран используется **maskable**-иконка: система накладывает маску (круг/сквиркл). Если контент иконки доходит до краёв или смещён, иконка выглядит «срезанной» или смещённой.

- **Safe zone:** центральные 80% (радиус 40% от минимальной стороны). Весь важный контент должен быть внутри.
- В `manifest.json` для `purpose: "maskable"` лучше использовать отдельный PNG с отступами (контент в центре 80%), а не ту же картинку, что и для `purpose: "any"`.
- Проверка: [maskable.app](https://maskable.app/).
- В проекте maskable для Mom Recipes генерируется скриптом `npm run generate:maskable-icon` → `public/icons/mom-recipes-app-icon-512-maskable.png` (исходник: `mom-recipes-app-icon-1024.png` или `-512.png`, контент в 80% safe zone на фоне #E8F1EC). В manifest для `purpose: "maskable"` подключён этот файл.

## Splash

- **Первый экран (браузер / ОС для PWA):** до показа страницы установленная PWA может показать **короткий** кадр «иконка на фоне» из manifest. Фон **`background_color` / `theme_color` = `#E8F1EC`**, иконки — maskable/any как в таблице выше. Для **нативной** оболочки (Capacitor) — отдельно `capacitor.config` и ассеты; это не требуется для установки с сайта.
- **Второй экран (кастомный):** полноэкранный фон `/splash/splash-screen.png` задаётся **сразу в `index.html` (inline CSS)**, чтобы не было пустого WebView до загрузки `main.tsx`. После бандла правила повторяются в `src/styles/splash.css` (нужно держать в синхроне с inline). Скрытие: `main.tsx` ждёт `window.load`, не раньше **2800 ms** с inline-метки времени, затем **~400 ms** fade-out. Подробности и чеклист: `docs/dev/splash-startup-2026-03-progress.md`.

Документация не является source-of-truth для архитектуры чата/БД; при изменении логики PWA/splash этот файл стоит обновить.
