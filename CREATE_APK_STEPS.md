# Пошаговая инструкция: Создание APK

## ⚠️ Важно: Android Studio должен быть установлен!

Если Android Studio не установлен:
1. Скачайте с https://developer.android.com/studio
2. Установите с Android SDK
3. Запустите и дождитесь завершения настройки

---

## Шаг 1: Соберите веб-приложение

Откройте терминал в папке проекта и выполните:

```bash
npm run build
```

Дождитесь завершения. Должна появиться папка `dist/` с файлами.

---

## Шаг 2: Добавьте Android платформу

Если папки `android/` еще нет, выполните:

```bash
npx cap add android
```

Это создаст Android проект.

---

## Шаг 3: Синхронизируйте файлы

```bash
npm run cap:sync
```

Эта команда:
- Скопирует файлы из `dist/` в Android проект
- Обновит нативные файлы

---

## Шаг 4: Откройте Android Studio

```bash
npm run cap:open:android
```

Или откройте Android Studio вручную и выберите папку `android/`.

**Дождитесь завершения индексации и синхронизации Gradle!**

---

## Шаг 5: В Android Studio - Соберите APK

### Для тестирования (Debug APK):

1. В меню: **Build** → **Build Bundle(s) / APK(s)** → **Build APK(s)**
2. Дождитесь завершения (внизу будет прогресс)
3. Когда появится уведомление "APK(s) generated successfully"
4. Нажмите **locate** в уведомлении
5. APK файл: `android/app/build/outputs/apk/debug/app-debug.apk`

### Для публикации (Release APK):

1. **Build** → **Generate Signed Bundle / APK**
2. Выберите **APK** → **Next**
3. **Create new...** (создать новый ключ) или выберите существующий
4. Заполните данные ключа:
   - Key store path: выберите место сохранения
   - Password: придумайте пароль (запомните!)
   - Key alias: например, `momrecipes`
   - Key password: пароль для ключа
   - Validity: 25 лет
   - Certificate: заполните данные
5. **Next** → выберите **release** → **Finish**
6. APK файл: `android/app/build/outputs/apk/release/app-release.apk`

---

## Шаг 6: Установите APK на устройство

### Способ 1: Через USB (рекомендуется)

1. На Android устройстве:
   - Настройки → О телефоне → нажмите 7 раз на "Номер сборки" (включит режим разработчика)
   - Настройки → Для разработчиков → включите "Отладка по USB"
2. Подключите устройство к компьютеру USB кабелем
3. В Android Studio: **Run** → **Run 'app'**
4. Выберите ваше устройство
5. Приложение установится автоматически

### Способ 2: Через файл

1. Скопируйте APK файл на Android устройство (через USB, email, облако)
2. На устройстве откройте файловый менеджер
3. Найдите APK файл и откройте его
4. Если нужно, разрешите установку из неизвестных источников
5. Нажмите "Установить"

---

## Быстрая команда (все сразу)

Если Android проект уже создан, можно выполнить:

```bash
npm run build && npm run cap:sync && npm run cap:open:android
```

Затем в Android Studio: **Build** → **Build APK(s)**

---

## Проверка перед сборкой

Убедитесь, что:
- ✅ `npm run build` выполнен без ошибок
- ✅ Папка `dist/` существует
- ✅ Android Studio открыт
- ✅ Gradle синхронизация завершена (без ошибок внизу)

---

## Решение проблем

### "SDK not found"
- Android Studio → **File** → **Settings** → **Android SDK**
- Установите Android SDK (API 33+)

### Gradle ошибки
- **File** → **Sync Project with Gradle Files**
- Или: **Build** → **Clean Project** → **Rebuild Project**

### APK не устанавливается
- Проверьте версию Android на устройстве (минимум API 21)
- Убедитесь, что включена установка из неизвестных источников

---

## Где найти APK после сборки

- **Debug APK**: `android/app/build/outputs/apk/debug/app-debug.apk`
- **Release APK**: `android/app/build/outputs/apk/release/app-release.apk`

---

## Размер APK

- Debug: ~20-30 MB
- Release: ~10-20 MB (оптимизированный)
