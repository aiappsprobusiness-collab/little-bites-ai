# Быстрый старт - Решение проблем

## Если приложение не запускается

### Шаг 1: Проверьте терминал

**Проблема с PowerShell?** Используйте командную строку (cmd):
1. В Cursor: View → Terminal → выберите "Command Prompt"
2. Или откройте cmd отдельно: `Win+R` → `cmd`

### Шаг 2: Создайте файл .env

Создайте файл `.env` в корне проекта (рядом с `package.json`):

```env
VITE_GIGACHAT_CLIENT_SECRET_KEY=MDE5YmQyOGItMzU3OC03MWE4LWFhZGQtNTM1NzUzZjFkYjEzOjZhNWI2MmJiLTkxMTgtNDFjOS1hOWEyLTIwNmMzMWYxMzY0ZQ==
VITE_GIGACHAT_IS_PERSONAL=true
```

### Шаг 3: Установите зависимости

```bash
npm install
```

### Шаг 4: Запустите dev сервер

```bash
npm run dev
```

### Шаг 5: Откройте браузер

Перейдите на http://localhost:8080

## Если видите ошибки в браузере

1. Откройте DevTools (F12)
2. Проверьте вкладку Console
3. Скопируйте ошибки и сообщите о них

## Если порт 8080 занят

Измените порт в `vite.config.ts`:
```typescript
server: {
  port: 3000, // или другой свободный порт
}
```

## Приложение должно работать БЕЗ GigaChat

Если GigaChat не настроен, приложение все равно должно запускаться:
- Будет работать без AI функций
- Можно использовать все остальные функции
- При попытке использовать AI функции появится сообщение о необходимости настройки

## Проверка работоспособности

После запуска `npm run dev` вы должны увидеть:
```
VITE v5.x.x  ready in xxx ms

➜  Local:   http://localhost:8080/
```

Если этого нет - проверьте ошибки в терминале.
