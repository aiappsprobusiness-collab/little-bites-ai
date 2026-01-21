# Установка недостающей зависимости

## Проблема
Ошибка: `Could not resolve "@emotion/is-prop-valid" imported by "framer-motion"`

## Решение

Я добавил `@emotion/is-prop-valid` в `package.json` и обновил конфигурацию Vite.

**Теперь выполните:**

```bash
npm install
```

После установки перезапустите dev сервер:

```bash
npm run dev
```

## Что было исправлено

1. ✅ Добавлен `@emotion/is-prop-valid` в зависимости
2. ✅ Обновлен `vite.config.ts` - убрано исключение из оптимизации
3. ✅ Теперь Vite будет правильно обрабатывать эту зависимость

После `npm install` приложение должно работать!
