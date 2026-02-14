# Capacitor Setup для MomRecipes

## Установка зависимостей

```bash
npm install
```

## Инициализация Capacitor

После установки зависимостей выполните:

```bash
npx cap init
```

При запросе введите:
- **App name**: MomRecipes
- **App ID**: com.momrecipes.app
- **Web dir**: dist

## Добавление платформ

### Android

```bash
npx cap add android
```

### iOS (только на macOS)

**Важно:** iOS разработка возможна только на macOS с установленным Xcode.

1. Установите Xcode из App Store
2. Установите CocoaPods:
```bash
sudo gem install cocoapods
```

3. Добавьте iOS платформу:
```bash
npx cap add ios
```

4. Установите зависимости:
```bash
cd ios/App
pod install
cd ../..
```

## Сборка и синхронизация

1. Соберите веб-приложение:
```bash
npm run build
```

2. Синхронизируйте с Capacitor:
```bash
npm run cap:sync
```

Или используйте отдельные команды:
```bash
npm run cap:copy  # Копирует веб-файлы
npx cap sync      # Синхронизирует нативные проекты
```

## Открытие нативных IDE

### Android Studio

```bash
npm run cap:open:android
```

Или:
```bash
npx cap open android
```

### Xcode (только на macOS)

```bash
npm run cap:open:ios
```

Или:
```bash
npx cap open ios
```

## Иконка приложения (Android / iOS)

Иконки для PWA генерируются при сборке из `public/icon-source.png`. Для нативных иконок Android и iOS после добавления платформ (`npx cap add android` / `npx cap add ios`) выполните:

```bash
npm run generate:capacitor-icons
```

Используется `assets/icon.png` (1024×1024), он создаётся при `npm run generate:icons` из `public/icon-source.png`.

## Полезные команды

- `npm run build` - Сборка веб-приложения (включает генерацию иконок)
- `npm run generate:icons` - Генерация иконок PWA и `assets/icon.png`
- `npm run generate:capacitor-icons` - Генерация иконок для Android/iOS (нужны папки android/ и ios/)
- `npm run cap:sync` - Синхронизация с нативными платформами
- `npm run cap:copy` - Копирование веб-файлов
- `npm run cap:open:android` - Открытие Android Studio
- `npm run cap:open:ios` - Открытие Xcode (только на macOS)

## Структура проекта

После инициализации будет создана следующая структура:

```
├── android/          # Android проект
├── ios/              # iOS проект (если добавлен)
├── capacitor.config.ts  # Конфигурация Capacitor
└── dist/             # Собранное веб-приложение
```

## Требования

### Общие
- Node.js 18+
- npm или yarn

### Для Android
- Android Studio
- Java JDK 11+
- Android SDK

### Для iOS (только на macOS)
- macOS (обязательно!)
- Xcode (из App Store)
- CocoaPods (`sudo gem install cocoapods`)
- Apple Developer Account (для публикации в App Store)

## Дополнительная информация

Конфигурация Capacitor находится в файле `capacitor.config.ts`.

Для работы с нативными функциями установлены следующие плагины:
- @capacitor/app - Управление жизненным циклом приложения
- @capacitor/haptics - Тактильная обратная связь
- @capacitor/keyboard - Управление клавиатурой
- @capacitor/status-bar - Управление статус-баром
