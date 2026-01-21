# Исправление ошибки "Could not resolve com.google.jimfs:jimfs:1.1"

## Проблема
Gradle не может найти зависимость `com.google.jimfs:jimfs:1.1`. Это означает, что репозитории не настроены правильно.

## Решение

### Шаг 1: Откройте файл `android/build.gradle`

В Android Studio откройте файл `android/build.gradle` (корневой файл проекта).

### Шаг 2: Проверьте блок repositories

Убедитесь, что в файле есть правильные репозитории:

#### В блоке `buildscript`:

```gradle
buildscript {
    repositories {
        google()
        mavenCentral()
        // jcenter() - НЕ ИСПОЛЬЗУЙТЕ!
    }
    dependencies {
        classpath 'com.android.tools.build:gradle:8.1.0'  // или ваша версия
        // другие зависимости
    }
}
```

#### В блоке `allprojects` или в `settings.gradle`:

```gradle
allprojects {
    repositories {
        google()
        mavenCentral()
        // jcenter() - НЕ ИСПОЛЬЗУЙТЕ!
    }
}
```

### Шаг 3: Если используете `settings.gradle` (новый формат)

В файле `android/settings.gradle` должно быть:

```gradle
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
```

### Шаг 4: Синхронизируйте Gradle

1. **File** → **Sync Project with Gradle Files**
2. Дождитесь завершения

### Шаг 5: Очистите кеш (если нужно)

Если проблема осталась:

1. **File** → **Invalidate Caches / Restart**
2. Выберите **Invalidate and Restart**
3. После перезапуска: **File** → **Sync Project with Gradle Files**

## Альтернативное решение

Если проблема с конкретной версией библиотеки, можно обновить версию в `android/app/build.gradle`:

```gradle
dependencies {
    // Если есть явное указание версии jimfs, обновите:
    implementation 'com.google.jimfs:jimfs:1.2'  // или более новая версия
}
```

## Проверка версии Gradle

Убедитесь, что используете актуальную версию Gradle:

1. Откройте `android/gradle/wrapper/gradle-wrapper.properties`
2. Проверьте версию:
   ```properties
   distributionUrl=https\://services.gradle.org/distributions/gradle-8.0-bin.zip
   ```
3. Если версия старая (ниже 7.0), обновите до 8.0+

## Полный пример правильного build.gradle

```gradle
buildscript {
    ext.kotlin_version = '1.9.0'
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath 'com.android.tools.build:gradle:8.1.0'
        classpath "org.jetbrains.kotlin:kotlin-gradle-plugin:$kotlin_version"
    }
}

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

task clean(type: Delete) {
    delete rootProject.buildDir
}
```

## Если ничего не помогает

1. Удалите папку `.gradle` в папке `android/`
2. Удалите папку `build` в папке `android/`
3. В Android Studio: **File** → **Invalidate Caches / Restart**
4. **File** → **Sync Project with Gradle Files**
