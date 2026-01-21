# Инструкция по настройке .env файла

## Важно о формате ключа

Предоставленный ключ `8336563511:AAEIxgVyEFf9y2N6Cklf-bgC-JKaeTe1XjU` имеет формат Telegram Bot API.

**Для GigaChat нужен ключ с developers.sber.ru/gigachat**

Если у вас есть GigaChat ключ, выполните следующие шаги:

## Шаг 1: Создайте файл .env

Создайте файл `.env` в корне проекта (рядом с `package.json`)

## Шаг 2: Добавьте ключ GigaChat

Если у вас есть GigaChat Client Secret Key, конвертируйте его в Base64:

### В браузере (консоль):
```javascript
btoa('ваш_gigachat_ключ')
```

### В PowerShell:
```powershell
[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('ваш_gigachat_ключ'))
```

### Содержимое файла .env:
```env
VITE_GIGACHAT_CLIENT_SECRET_KEY=ваш_base64_ключ_здесь
VITE_GIGACHAT_IS_PERSONAL=true
```

## Шаг 3: Перезапустите dev сервер

После создания/изменения `.env` файла обязательно перезапустите сервер:
```bash
npm run dev
```

## Если у вас Telegram Bot API ключ

Если предоставленный ключ - это Telegram Bot API, и вы хотите добавить Telegram интеграцию, сообщите об этом, и я добавлю поддержку Telegram бота.

## Получение GigaChat ключа

1. Перейдите на https://developers.sber.ru/gigachat
2. Зарегистрируйтесь/войдите
3. Создайте приложение
4. Получите Client Secret Key
5. Конвертируйте в Base64 (см. выше)
