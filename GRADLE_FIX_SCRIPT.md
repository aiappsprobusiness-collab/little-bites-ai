# Автоматическое исправление Gradle конфигурации

## Если у вас есть доступ к файлам через терминал

Выполните эти команды для автоматического исправления:

### Windows PowerShell:

```powershell
# Перейдите в папку android
cd android

# Исправьте build.gradle (корневой)
(Get-Content build.gradle) -replace 'jcenter\(\)', '' | Set-Content build.gradle

# Убедитесь, что есть google() и mavenCentral()
$content = Get-Content build.gradle -Raw
if ($content -notmatch 'google\(\)') {
    $content = $content -replace '(repositories\s*\{)', "`$1`n        google()`n"
}
if ($content -notmatch 'mavenCentral\(\)') {
    $content = $content -replace '(repositories\s*\{)', "`$1`n        mavenCentral()`n"
}
Set-Content build.gradle -Value $content

# Исправьте settings.gradle (если есть)
if (Test-Path settings.gradle) {
    (Get-Content settings.gradle) -replace 'jcenter\(\)', '' | Set-Content settings.gradle
}

cd ..
```

### Или вручную в Android Studio:

1. Откройте `android/build.gradle`
2. Найдите все `jcenter()` и удалите
3. Убедитесь, что есть:
   ```gradle
   repositories {
       google()
       mavenCentral()
   }
   ```
4. Сохраните файл
5. **File** → **Sync Project with Gradle Files**
