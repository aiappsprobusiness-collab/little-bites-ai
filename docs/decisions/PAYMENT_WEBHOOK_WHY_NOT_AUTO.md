# Почему статус не ставится в premium автоматически

## Цепочка при успешной оплате

1. Пользователь нажимает «Оплатить» → вызывается **create-payment** → в БД создаётся запись в `subscriptions` (status=pending, order_id, потом payment_id от Т-Банка).
2. Пользователь платит на стороне Т-Банка.
3. **Т-Банк должен отправить POST** на наш URL с телом: Status=CONFIRMED, PaymentId, OrderId, Token (подпись).
4. Наша функция **payment-webhook** принимает запрос, проверяет Token, ищет подписку по PaymentId/OrderId, обновляет `subscriptions` и `profiles_v2`.

Если шаг 3 не выполняется или шаг 4 падает — в БД статус не обновится.

---

## Возможные причины (что проверить)

### 1. Вебхук не подключён в Т-Банке

По документации Т-Банка (T-API) вебхук «Статус платежа» подключается **по заявке**:

- Написать на **openapi@tbank.ru** с почты, привязанной к компании.
- В письме указать:
  - **ИНН** компании;
  - **Вебхук:** Статус платежа;
  - **Адрес метода:** `https://hidgiyyunigqazssnydm.supabase.co/functions/v1/payment-webhook`;
  - Данные для авторизации — не нужны (у нас без авторизации, проверка по Token в теле).

Подключение занимает до 2 рабочих дней. Если письмо не отправляли или указали другой URL — запросы на наш webhook не приходят.

**Что сделать:** отправить заявку на openapi@tbank.ru с указанным URL и перепроверить, что в ответе подтвердили именно этот адрес.

---

### 2. В логах payment-webhook пусто

Если в Supabase → Edge Functions → payment-webhook → Logs **нет записей** после оплаты — запросы от Т-Банка до нас не доходят (не тот URL, вебхук не подключён или не для этого терминала).

**Что сделать:** убедиться, что вебхук подключён (п.1), затем сделать тестовую оплату и сразу открыть логи. Должна появиться хотя бы одна строка (received / reject / skip / error).

---

### 3. В логах есть запрос, но 400 Invalid Token

Значит, запрос доходит, но подпись не совпадает. Возможные причины:

- В Supabase у функции **payment-webhook** задан другой **TINKOFF_SECRET_KEY** (не тот, что в личном кабинете терминала).
- Т-Банк считает подпись по другому набору полей или порядку (отличия в документации EACQ vs T-API).

**Что сделать:** проверить, что в Secrets для payment-webhook указан тот же пароль, что в ЛК терминала. При необходимости уточнить в поддержке Т-Банка точный алгоритм подписи для уведомлений о статусе платежа.

---

### 4. В логах: "subscription not found or already confirmed"

Мы получили CONFIRMED и валидный Token, но не нашли запись в `subscriptions` по PaymentId и OrderId, или она уже confirmed.

- **OrderId:** в коде мы ищем и по `OrderId`, и по `orderId` (разный регистр). Если Т-Банк присылает другое имя поля — нужно добавить его в код.
- **Формат OrderId:** мы сохраняем в create-payment строку вида `54fcca8d607fmldzuqv5` (до 36 символов). Если в уведомлении приходит тот же заказ в другом формате (например, с префиксом или обрезанный) — поиск не сработает.

**Что сделать:** в логах посмотреть точные значения `PaymentId` и `OrderId` из входящего запроса. Сравнить с полями `payment_id` и `order_id` в таблице `subscriptions` для этой оплаты. Если имена полей другие — дописать их в payment-webhook; если формат OrderId другой — добавить нормализацию (например, обрезка до 36 символов или приведение к одному виду).

---

### 5. Ошибка 500 в логах

В логах будет строка `[payment-webhook] error` и стек. Часто это:

- нет переменных **SUPABASE_URL** или **SUPABASE_SERVICE_ROLE_KEY** у функции;
- ошибка при обращении к БД (нет прав, неверная схема).

**Что сделать:** проверить Secrets у payment-webhook и права service_role на таблицы `subscriptions` и `profiles_v2`.

---

## Что уже сделано в коде

- В **payment-webhook** включено логирование: при каждом запросе пишется `[payment-webhook] received`, при отказе — причина (Missing Token, Invalid Token, status not CONFIRMED, subscription not found), при успехе — обновление подписки и профиля, при ошибке — `[payment-webhook] error`.
- Поддержан и **OrderId**, и **orderId** в теле запроса (на случай разного регистра от Т-Банка).
- У функции отключена проверка JWT (`verify_jwt = false`), чтобы Т-Банк мог слать запросы без заголовка Authorization.

---

## Краткий чек-лист для тебя

1. Отправить заявку на **openapi@tbank.ru** на подключение вебхука «Статус платежа» с URL  
   `https://hidgiyyunigqazssnydm.supabase.co/functions/v1/payment-webhook`.
2. После подключения сделать тестовую оплату (можно тем же пользователем 54fcca8d-607f-4146-a340-cef9e2d293b0).
3. Сразу открыть **Supabase → Edge Functions → payment-webhook → Logs** и посмотреть:
   - есть ли запись (если нет — вебхук не доходит);
   - если есть — текст лога: Invalid Token, subscription not found или успешное обновление.
4. По логам исправить: либо секрет, либо поиск по OrderId/PaymentId, либо формат полей (если понадобится).
5. Передеплоить **payment-webhook** после изменений в коде:  
   `npx supabase functions deploy payment-webhook --no-verify-jwt`

После того как вебхук начнёт стабильно вызываться и в логах будет «updating subscription and profile», статус будет выставляться в premium автоматически; вручную для этого пользователя ничего ставить не нужно.

---

## Имитация webhook (для отладки)

Проверка, что endpoint доступен и отвечает (ожидаемо 400 из‑за неверного Token):

```bash
# Windows (PowerShell) — тело из файла
curl.exe -X POST "https://hidgiyyunigqazssnydm.supabase.co/functions/v1/payment-webhook" -H "Content-Type: application/json" -d "@scripts/webhook-test-body.json"

# Или однострочно (подставь свой OrderId из subscriptions)
curl.exe -X POST "https://hidgiyyunigqazssnydm.supabase.co/functions/v1/payment-webhook" -H "Content-Type: application/json" -d "{\"Status\":\"CONFIRMED\",\"PaymentId\":123,\"OrderId\":\"54fcca8d607fmldzuqv5\",\"Token\":\"x\"}"
```

В логах payment-webhook должна появиться запись (например, «reject: Invalid Token»).
