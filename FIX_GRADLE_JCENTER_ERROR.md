# Исправление ошибки jcenter() в Gradle

## Проблема
```
Could not find method jcenter() for arguments [] on repository container
```

Это происходит потому, что `jcenter()` был удален из Gradle. Нужно заменить его на `mavenCentral()`.

## Решение

### Шаг 1: Откройте файлы build.gradle

В Android Studio найдите и откройте следующие файлы:

1. **`android/build.gradle`** (корневой файл проекта)
2. **`android/app/build.gradle`** (файл модуля app)
3. **`android/settings.gradle`** (если есть)

### Шаг 2: Найдите и замените jcenter()

В каждом файле найдите строки с `jcenter()` и замените их:

#### Было:
```gradle
repositories {
    google()
    jcenter()  // ❌ Удалить эту строку
    mavenCentral()
}
```

#### Стало:
```gradle
repositories {
    google()
    mavenCentral()  // ✅ Используйте только это
}
```

### Шаг 3: Типичные места для исправления

#### В `android/build.gradle` (корневой):

Найдите блок `allprojects` или `buildscript`:

```gradle
buildscript {
    repositories {
        google()
        // jcenter()  // ❌ Удалите или закомментируйте
        mavenCentral()
    }
}

allprojects {
    repositories {
        google()
        // jcenter()  // ❌ Удалите или закомментируйте
        mavenCentral()
    }
}
```

#### В `android/settings.gradle`:

```gradle
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        // jcenter()  // ❌ Удалите
        mavenCentral()
    }
}
```

### Шаг 4: Синхронизируйте Gradle

После исправления:

1. В Android Studio нажмите **File** → **Sync Project with Gradle Files**
2. Или нажмите на уведомление "Sync Now" вверху
3. Дождитесь завершения синхронизации

### Шаг 5: Очистите проект (если нужно)

Если ошибка осталась:

1. **Build** → **Clean Project**
2. **Build** → **Rebuild Project**

## Быстрое решение

Если вы видите ошибку в Android Studio:

1. Нажмите на красную строку с ошибкой
2. Android Studio может предложить автоматическое исправление
3. Или нажмите `Ctrl+Shift+F` (Find in Files)
4. Найдите `jcenter()` во всех файлах
5. Замените на `mavenCentral()` или удалите строку

## Альтернативное решение

Если не хотите редактировать вручную, можно использовать поиск и замену:

1. В Android Studio: **Edit** → **Find** → **Replace in Files** (Ctrl+Shift+R)
2. Find: `jcenter()`
3. Replace: `mavenCentral()` (или просто удалите строку)
4. Scope: Project Files
5. Нажмите **Replace All**

## Проверка

После исправления проверьте:

1. ✅ Gradle синхронизация завершена без ошибок
2. ✅ В Build окне нет ошибок
3. ✅ Можно собрать APK: **Build** → **Build APK(s)**

## Если проблема осталась

1. Убедитесь, что обновили **все** файлы build.gradle
2. Проверьте версию Gradle в `android/gradle/wrapper/gradle-wrapper.properties`
3. Обновите Gradle до последней версии (7.0+)

## Дополнительная информация

- `jcenter()` был удален в Gradle 8.0+
- `mavenCentral()` - современная замена
- Google рекомендует использовать только `google()` и `mavenCentral()`
