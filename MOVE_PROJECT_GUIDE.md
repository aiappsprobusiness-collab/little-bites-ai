# Инструкция по перемещению проекта

## Текущее расположение (с кириллицей - ПРОБЛЕМА)

```
C:\Users\alesa\OneDrive\Рабочий стол\Repositories\little-bites-ai
```

**Проблема:** Путь содержит кириллицу "Рабочий стол", что вызывает ошибки в Android Gradle Plugin 8+.

---

## Рекомендуемые новые расположения (БЕЗ кириллицы)

### Вариант 1: В папке Projects (рекомендуется)
```
C:\Projects\little-bites-ai
```

### Вариант 2: В папке Dev
```
C:\Dev\little-bites-ai
```

### Вариант 3: В папке пользователя, но без кириллицы
```
C:\Users\alesa\Projects\little-bites-ai
```

### Вариант 4: Прямо на диске C
```
C:\little-bites-ai
```

### Вариант 5: В OneDrive, но с английским названием
```
C:\Users\alesa\OneDrive\Projects\little-bites-ai
```
или
```
C:\Users\alesa\OneDrive\Repositories\little-bites-ai
```
(если переименовать "Рабочий стол" в "Desktop" или создать папку "Projects")

---

## Пошаговая инструкция по перемещению

### Шаг 1: Создайте новую папку

Выберите один из вариантов выше и создайте папку. Например:

**В PowerShell или командной строке:**
```powershell
# Создать папку Projects (если её нет)
New-Item -ItemType Directory -Path "C:\Projects" -Force

# Или через проводник Windows
```

### Шаг 2: Закройте все программы

1. Закройте Android Studio
2. Закройте Cursor/VS Code
3. Убедитесь, что нет запущенных процессов (npm run dev и т.д.)

### Шаг 3: Скопируйте проект

**Через PowerShell:**
```powershell
# Скопировать проект
Copy-Item -Path "C:\Users\alesa\OneDrive\Рабочий стол\Repositories\little-bites-ai" -Destination "C:\Projects\little-bites-ai" -Recurse
```

**Или через проводник Windows:**
1. Откройте `C:\Users\alesa\OneDrive\Рабочий стол\Repositories\`
2. Скопируйте папку `little-bites-ai`
3. Вставьте в `C:\Projects\`

### Шаг 4: Откройте проект в новом месте

1. Откройте Android Studio
2. **File** → **Open**
3. Выберите новую папку: `C:\Projects\little-bites-ai`
4. Дождитесь синхронизации Gradle

### Шаг 5: Откройте проект в Cursor/VS Code

1. Откройте Cursor
2. **File** → **Open Folder**
3. Выберите: `C:\Projects\little-bites-ai`

### Шаг 6: Удалите временное решение

После успешной сборки в новом месте, откройте:
```
C:\Projects\little-bites-ai\android\gradle.properties
```

И удалите строку:
```properties
android.overridePathCheck=true
```

### Шаг 7: Удалите старую папку (опционально)

После проверки, что все работает в новом месте:
```
C:\Users\alesa\OneDrive\Рабочий стол\Repositories\little-bites-ai
```

---

## Проверка после перемещения

1. ✅ Откройте проект в Android Studio
2. ✅ **File** → **Sync Project with Gradle Files** (должно работать без ошибок)
3. ✅ **Build** → **Build APK(s)** (должно собраться)
4. ✅ В терминале: `npm run dev` (должно работать)
5. ✅ В терминале: `npm run build` (должно работать)

---

## Важно

- ⚠️ Не удаляйте старую папку сразу - сначала убедитесь, что все работает
- ⚠️ Если используете Git, проверьте, что `.git` папка скопировалась
- ⚠️ Если используете `.env` файл, убедитесь, что он скопировался

---

## Быстрая команда для копирования

```powershell
# Создать папку и скопировать проект
New-Item -ItemType Directory -Path "C:\Projects" -Force
Copy-Item -Path "C:\Users\alesa\OneDrive\Рабочий стол\Repositories\little-bites-ai" -Destination "C:\Projects\little-bites-ai" -Recurse
```

После этого откройте `C:\Projects\little-bites-ai` в Android Studio и Cursor.
