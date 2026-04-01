# Премиум без завершённой оплаты (проверка и что делать)

## Как сейчас выставляется premium

1. **Единственный путь в коде:** Edge Function `payment-webhook` вызывает RPC `confirm_subscription_webhook` **только** когда T-Bank присылает уведомление с `Status === "CONFIRMED"`.
2. Страницы `PaymentSuccess` / `PaymentFail` **ничего не пишут в БД** — только показывают UI.
3. Клиент **не** вызывает обновление статуса на premium (есть `updateSubscriptionStatus` в `useSubscription`, но он нигде не вызывается с `"premium"` при успехе оплаты).

## Возможные причины «премиум без оплаты»

- **T-Bank прислал CONFIRMED ошибочно** (например, при редиректе на Success URL до фактического списания, или дубль уведомления).
- **Тестовый/особый сценарий** в личном кабинете T-Bank (например, ручное подтверждение).
- **Повторная доставка (replay)** вебхука: при повторной отправке того же уведомления идемпотентность по `subscriptions.status = 'confirmed'` не даёт обновить подписку повторно, но если по какой-то причине был создан второй платёж и оба пришли — возможна путаница.

## Что проверить

1. **Логи Edge Function** `payment-webhook` в Supabase: были ли вызовы с `Status: CONFIRMED` для этого пользователя (user_id `54fcca8d-607f-4146-a340-cef9e2d293b0`)?
2. **Таблица `subscriptions`:** запись с этим `user_id` — какой `status`, `order_id`, `payment_id`? Есть ли несколько записей?
3. **Личный кабинет T-Bank:** статус платежа по этому `order_id`/`payment_id` — действительно ли платёж в статусе «Проведён»/«Успешен».

## Что сделать для пользователя 54fcca8d-607f-4146-a340-cef9e2d293b0

Сбросить статус и срок премиума вручную (если оплата не была завершена):

```sql
-- Проверить текущее состояние
SELECT user_id, status, premium_until, trial_until FROM profiles_v2
WHERE user_id = '54fcca8d-607f-4146-a340-cef9e2d293b0';

-- Если нужно вернуть в триал (если у пользователя был активный триал):
-- UPDATE profiles_v2
-- SET status = 'trial', premium_until = NULL
-- WHERE user_id = '54fcca8d-607f-4146-a340-cef9e2d293b0';

-- Если нужно вернуть в free:
-- UPDATE profiles_v2
-- SET status = 'free', premium_until = NULL
-- WHERE user_id = '54fcca8d-607f-4146-a340-cef9e2d293b0';
```

Или использовать существующий скрипт (если подходит под вашу схему):

```bash
node scripts/reset-subscription-to-free.mjs 54fcca8d-607f-4146-a340-cef9e2d293b0
```

(Проверьте наличие и параметры скрипта в репозитории.)

## Валидация суммы и тарифа (актуально)

Реализовано в Edge `payment-webhook` + модуль `supabase/functions/_shared/subscriptionPaymentGuards.ts`.

- Источник тарифа для начисления: **`subscriptions.plan`** у найденной pending-строки (создана вместе с `order_id` в `create-payment`).
- **`Amount`** из уведомления Т-Банка должен **точно** совпадать с ожидаемой суммой для этого плана (29900 / 199900 копеек; цены из `_shared/subscriptionPricing.json`).
- Дополнительно: согласованность `DATA.plan` и `OrderId` с записью в БД (см. подробности в **`docs/dev/PAYMENT_WEBHOOK_PREMIUM_VALIDATION.md`**).
- При несоответствии Premium **не** выдаётся; логируется `grant_denied` с причиной; ответ процессингу остаётся 200 OK.

Идемпотентность повторных webhook не менялась: уже подтверждённая подписка не обрабатывается повторно.

## Прочие рекомендации (опционально)

- Опционально: перед вызовом `confirm_subscription_webhook` дополнительно дергать API Т-Банка (GetState), если нужна внешняя перепроверка.
- Не вызывать на клиенте установку `status = 'premium'` по факту перехода на Success URL — источник истины только вебхук.
