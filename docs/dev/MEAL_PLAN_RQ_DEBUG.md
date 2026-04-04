# Диагностика React Query на `/meal-plan` (`?rqDebug=1`)

## Включение

1. Локальный dev-сервер (`npm run dev`).
2. Открыть план с параметром в URL: `http://localhost:5173/meal-plan?rqDebug=1` (порт по факту).
3. Перезагрузить страницу с этим параметром (эффект подписывается на mount).

## Что логируется

- `[rqDebug] invalidateQueries` / `[rqDebug] refetchQueries` — фильтры, с которыми вызваны методы `QueryClient`.
- `[rqDebug] query fetching` — старт сетевого fetch у query (после `queryHash` и `queryKey`).

Компонент: `src/dev/ReactQueryDiag.tsx`. В production-сборке не монтируется (`import.meta.env.DEV` в `App.tsx`).

## Что прислать для разбора

1. Очистить Network (или открыть в новой вкладке с `?rqDebug=1`).
2. Один сценарий: cold reload `/meal-plan` **или** одна замена слота.
3. Скрин или экспорт консоли с префиксом `[rqDebug]` + при необходимости фильтр Network (Fetch/XHR).
