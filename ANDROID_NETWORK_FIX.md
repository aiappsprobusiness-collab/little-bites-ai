# Исправление сетевых ошибок в Android APK

## Проблема

При попытке входа в Android APK возникают ошибки:
- **499 (Job execution was cancelled: Job timed out)** в Supabase
- **"Failed to fetch"** в приложении
- **"Ошибка входа"** для пользователя

## Причины

1. **Таймауты запросов слишком короткие** для мобильных сетей
2. **WebView блокирует HTTPS запросы** без правильной конфигурации
3. **Отсутствие обработки сетевых ошибок** с понятными сообщениями

## Решение

### 1. Добавлен Network Security Config для Android

**Файл:** `android/app/src/main/res/xml/network_security_config.xml`

Этот файл разрешает HTTPS запросы к Supabase и другим серверам.

### 2. Обновлён AndroidManifest.xml

Добавлены атрибуты:
- `android:usesCleartextTraffic="false"` - запрещаем HTTP, только HTTPS
- `android:networkSecurityConfig="@xml/network_security_config"` - используем наш конфиг

### 3. Улучшена конфигурация Supabase Client

**Файл:** `src/integrations/supabase/client.ts`

- Увеличен таймаут до 60 секунд для мобильных приложений
- Добавлена правильная обработка таймаутов через AbortController
- Улучшены сообщения об ошибках на русском языке

### 4. Улучшена обработка ошибок в useAuth

**Файл:** `src/hooks/useAuth.tsx`

- Добавлена обработка сетевых ошибок
- Перевод сообщений об ошибках на русский
- Обработка таймаутов и "Failed to fetch"

### 5. Улучшена обработка ошибок в AuthPage

**Файл:** `src/pages/AuthPage.tsx`

- Добавлен try-catch для обработки исключений
- Улучшены сообщения об ошибках для пользователя

## Что нужно сделать

1. **Пересобрать APK:**
   ```bash
   npm run build
   npm run cap:sync
   # Затем в Android Studio: Build → Build Bundle(s) / APK(s) → Build APK(s)
   ```

2. **Проверить, что файл network_security_config.xml создан:**
   - Путь: `android/app/src/main/res/xml/network_security_config.xml`
   - Если папки `xml` нет, создайте её

3. **Проверить AndroidManifest.xml:**
   - Должны быть добавлены атрибуты `usesCleartextTraffic` и `networkSecurityConfig`

## Тестирование

После пересборки APK:

1. **Проверьте подключение к интернету** на устройстве
2. **Попробуйте войти** с правильными credentials
3. **Проверьте логи в Android Studio Logcat:**
   - Фильтр: `supabase` или `auth`
   - Ищите ошибки сети или таймауты

## Если проблема остаётся

1. **Проверьте интернет-соединение** на устройстве
2. **Проверьте, что Supabase доступен:**
   - Откройте в браузере: `https://hidgiyyunigqazssnydm.supabase.co`
   - Должна открыться страница Supabase
3. **Проверьте логи в Android Studio:**
   - Logcat → Filter by package: `com.momrecipes.app`
   - Ищите ошибки сети или SSL
4. **Проверьте, что network_security_config.xml правильно создан:**
   - Должен быть в `android/app/src/main/res/xml/`
   - Должен содержать правильный домен Supabase

## Технические детали

### Network Security Config

Разрешает HTTPS запросы к:
- `hidgiyyunigqazssnydm.supabase.co` (и поддоменам)
- Все остальные HTTPS запросы через системные сертификаты

### Таймауты

- **Таймаут запроса:** 60 секунд (вместо стандартных 30)
- **Отмена через AbortController:** правильная отмена запроса при таймауте

### Обработка ошибок

Все сетевые ошибки перехватываются и переводятся в понятные сообщения:
- "Превышено время ожидания" → для таймаутов
- "Не удалось подключиться к серверу" → для сетевых ошибок
- "Неверный email или пароль" → для ошибок авторизации
