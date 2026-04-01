# Webhook оплаты и выдача Premium (валидация суммы)

## Source of truth для цен (сервер)

| Источник | Назначение |
|----------|------------|
| `supabase/functions/_shared/subscriptionPricing.json` | Копейки для Init в `create-payment` и ожидаемые суммы в `payment-webhook` |
| `supabase/functions/_shared/subscriptionPaymentGuards.ts` | Чистая логика: `expectedAmountKopecks`, `evaluateWebhookSubscriptionGrant` |

Клиентские цены для UI — `src/utils/subscriptionPricing.ts` (должны совпадать с JSON по смыслу).

Канонические суммы:

- `month` → **29900** копеек  
- `year` → **199900** копеек  

Сравнение **строгое** (`actual === expected` после `Math.round` на числе из уведомления), без «допуска ±1%».

## Путь оплаты (кратко)

1. **Клиент:** `useSubscription.startPayment` → `supabase.functions.invoke("create-payment", { plan: "month" \| "year", ... })`.
2. **create-payment:** вставка строки `subscriptions` (`plan`, `order_id`, `status=pending`), Init в Т-Банк с `Amount` и `DATA: { plan }`.
3. **Т-Банк:** списание по ссылке; уведомление на `payment-webhook`.
4. **payment-webhook:** проверка подписи `Token` → при `CONFIRMED` поиск `subscriptions` по `payment_id` или `OrderId` → **гейт** → при успехе `confirm_subscription_webhook` → `profiles_v2` + `subscriptions.confirmed`.

Страницы `/payment/success` и `/payment/fail` **не** выставляют Premium.

## Что было до усиления (аудит)

- Проверялись: подпись webhook, `Status === "CONFIRMED"`, нахождение строки подписки, идемпотентность по уже `confirmed`.
- План для RPC определялся цепочкой: `DATA.plan` → шаблон `order_id` (`_month_` / `_year_`) → `subscriptions.plan` → **fallback по сумме** (если сумма похожа на месяц или год).
- **Пробела не было:** после выбора плана **не** проверялось, что `Amount` из уведомления равен ожидаемой цене для **фактически выбранного** тарифа. Теоретически при «успешном» CONFIRMED и корректной строке `subscriptions` Premium мог бы выдаться при несовпадающей сумме (если бы уведомление с такой суммой когда-либо пришло от процессинга).

## Текущие правила выдачи Premium

Все условия обязательны:

1. Валидная подпись уведомления (как раньше).
2. `Status === "CONFIRMED"`.
3. Найдена строка `subscriptions` со `status <> 'confirmed'` (как раньше).
4. `subscriptions.plan` ∈ `('month','year')`.
5. `Amount` из тела уведомления **число** и **ровно** `expectedAmountKopecks(plan)`.
6. Если в `DATA` передан распознаваемый `plan`, он **совпадает** с `subscriptions.plan`.
7. Если в уведомлении есть `OrderId` и в строке есть `order_id`, они **совпадают** (защита от несоответствия ключей).
8. `order_id` (из уведомления или строки БД) содержит сегмент `_month_` или `_year_` в соответствии с планом (формат генерирует только `create-payment`).

При любом нарушении: **RPC не вызывается**, Premium **не** выдаётся, в лог пишется `[payment-webhook] grant_denied` с `reason` и `details`. Ответ процессингу — **HTTP 200** и тело `OK` (как при прочих «мягких» отказах), чтобы не провоцировать бессмысленные ретраи из-за бизнес-отказа.

## Идемпотентность

- Повторный webhook по уже `confirmed`: ранний выход, без повторного начисления (как раньше).
- RPC `confirm_subscription_webhook`: обновление только при `status <> 'confirmed'`; при повторе `was_updated = false`.

## Тесты

`supabase/functions/_shared/subscriptionPaymentGuards.test.ts` — сценарии валидных/невалидных сумм, расхождение DATA/order_id, отсутствие Amount.

Запуск (из корня репозитория):

```bash
cd supabase/functions && npx deno test _shared/subscriptionPaymentGuards.test.ts --allow-read
```

(в `npm run test:edge` файл можно добавить в общий список, если Deno доступен в CI.)

## Ручная проверка (checklist)

- Успешная оплата месяца / года в тестовом терминале → в логах `validation_ok_grant`, в БД `confirmed` и ожидаемый `expires_at`.
- Намеренно изменить сумму в тестовом сценарии (если доступно) → `grant_denied`, подписка остаётся `pending`.
- Повтор того же CONFIRMED → `idempotent: already confirmed`.

## Связанные документы

- `docs/decisions/PAYMENT_PREMIUM_WITHOUT_COMPLETED_PAYMENT.md` — откуда берётся Premium, почему не клиентский Success URL.
- `docs/database/DATABASE_SCHEMA.md` — таблица `subscriptions`, `subscription_plan_audit`.
