# Инструкция по деплою Edge Function

## Способ 1: Через веб-интерфейс Supabase

1. Откройте https://supabase.com/dashboard
2. Выберите ваш проект
3. В левом меню нажмите **"Edge Functions"**
4. Найдите функцию **`deepseek-chat`** в списке
5. Кликните на название функции, чтобы открыть её
6. В редакторе:
   - Откройте файл `supabase/functions/deepseek-chat/index.ts` в вашем редакторе
   - Скопируйте весь код (Ctrl+A, Ctrl+C)
   - Вставьте в редактор Supabase (Ctrl+V)
7. Нажмите кнопку **"Deploy function"** или **"Save and Deploy"** внизу страницы
8. Дождитесь завершения деплоя (10-30 секунд)

## Способ 2: Через CLI (требует токен доступа)

### Шаг 1: Получите Access Token

1. В Supabase Dashboard перейдите в **Settings** → **Access Tokens**
2. Нажмите **"Generate new token"**
3. Скопируйте токен (он показывается только один раз!)

### Шаг 2: Залогиньтесь

```powershell
# Установите токен как переменную окружения
$env:SUPABASE_ACCESS_TOKEN = "ваш_токен_здесь"

# Или используйте флаг при логине
npx supabase login --token "ваш_токен_здесь"
```

### Шаг 3: Свяжите проект

```powershell
# Нужен project-ref из URL вашего проекта
# Например, если URL: https://supabase.com/dashboard/project/abcdefghijklmnop
# То project-ref = abcdefghijklmnop

npx supabase link --project-ref "ваш_project_ref"
```

### Шаг 4: Задеплойте функцию

```powershell
npm run supabase:deploy:chat
```

Или напрямую:

```powershell
npx supabase functions deploy deepseek-chat
```

## Проверка деплоя

После деплоя функция будет доступна по адресу:
```
https://YOUR_PROJECT_ID.supabase.co/functions/v1/deepseek-chat
```

Можно протестировать функцию в разделе Edge Functions → deepseek-chat → "Test" в Supabase Dashboard.
