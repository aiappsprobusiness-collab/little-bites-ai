# Создание APK файла для Android

## Шаг 1: Соберите веб-приложение

Сначала нужно собрать веб-версию приложения:

```bash
npm run build
```

Это создаст папку `dist/` с собранным приложением.

## Шаг 2: Добавьте Android платформу (если еще не добавлена)

Если папки `android/` нет, добавьте Android платформу:

```bash
npx cap add android
```

## Шаг 3: Синхронизируйте с Capacitor

Синхронизируйте веб-файлы с Android проектом:

```bash
npm run cap:sync
```

Или по отдельности:
```bash
npm run build
npm run cap:copy
npx cap sync
```

## Шаг 4: Откройте Android Studio

```bash
npm run cap:open:android
```

Или:
```bash
npx cap open android
```

## Шаг 5: В Android Studio - Соберите APK

### Вариант A: Debug APK (для тестирования)

1. В Android Studio: **Build** → **Build Bundle(s) / APK(s)** → **Build APK(s)**
2. Дождитесь завершения сборки
3. Когда появится уведомление "APK(s) generated successfully", нажмите **locate**
4. APK будет в: `android/app/build/outputs/apk/debug/app-debug.apk`

### Вариант B: Release APK (для публикации)

1. **Build** → **Generate Signed Bundle / APK**
2. Выберите **APK** → **Next**
3. Создайте или выберите ключ подписи (keystore):
   - Если нет ключа, нажмите **Create new...**
   - Заполните данные и сохраните ключ в безопасном месте!
4. Выберите **release** build variant → **Finish**
5. APK будет в: `android/app/build/outputs/apk/release/app-release.apk`

## Шаг 6: Установите APK на устройство

### Через USB:
1. Включите "Отладка по USB" на Android устройстве
2. Подключите устройство к компьютеру
3. В Android Studio: **Run** → **Run 'app'**
4. Или скопируйте APK на устройство и установите вручную

### Через файл:
1. Скопируйте APK файл на Android устройство
2. Откройте файл на устройстве
3. Разрешите установку из неизвестных источников (если нужно)
4. Установите приложение

## Требования

- **Android Studio** (установлен и настроен)
- **Java JDK 11+** (обычно идет с Android Studio)
- **Android SDK** (устанавливается через Android Studio)

## Проверка перед сборкой

Убедитесь, что:
- ✅ `npm run build` выполнен успешно
- ✅ Папка `dist/` существует и содержит файлы
- ✅ Android Studio открыт и проект загружен
- ✅ Gradle синхронизация завершена (без ошибок)

## Решение проблем

### Ошибка "SDK not found"
- Откройте Android Studio
- **File** → **Settings** → **Appearance & Behavior** → **System Settings** → **Android SDK**
- Установите необходимые SDK компоненты

### Ошибка Gradle
- В Android Studio: **File** → **Sync Project with Gradle Files**
- Или: **Build** → **Clean Project**, затем **Rebuild Project**

### APK не устанавливается
- Проверьте, что включена установка из неизвестных источников
- Убедитесь, что APK подписан (release APK)
- Проверьте минимальную версию Android в `build.gradle`

## Размер APK

Ожидаемый размер:
- Debug APK: ~15-25 MB
- Release APK: ~10-20 MB (после оптимизации)

## Дополнительная оптимизация

Для уменьшения размера APK:
1. В `android/app/build.gradle` добавьте:
```gradle
android {
    buildTypes {
        release {
            minifyEnabled true
            shrinkResources true
        }
    }
}
```

2. Используйте ProGuard для обфускации кода

## Публикация в Google Play

Для публикации в Google Play Store:
1. Создайте Release APK или AAB (Android App Bundle)
2. Загрузите в Google Play Console
3. Заполните информацию о приложении
4. Пройдите проверку Google
