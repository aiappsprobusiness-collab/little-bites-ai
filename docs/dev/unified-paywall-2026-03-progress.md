# Unified paywall — прогресс (март 2026)

## Сделано

- Введён **единый paywall** (`UnifiedPaywall`): один layout, один набор текстов и буллетов.
- Источник копирайта: **`src/utils/unifiedPaywallCopy.ts`**.
- Точка входа в коде: **`src/components/subscription/Paywall.tsx`** — по умолчанию рендерит `UnifiedPaywall`, при отключённом флаге — `LegacyPaywall`.
- **По умолчанию включено:** `FF_UNIFIED_PAYWALL` в **`src/config/featureFlags.ts`** (выключается только явным `VITE_FF_UNIFIED_PAYWALL=false`).

## Entry points (все ведут на тот же глобальный/страничный `<Paywall />` или `setShowPaywall`, с сохранением `paywall_reason` в сторе)

- Глобальный paywall в **`App.tsx`** (`GlobalPaywall`).
- Профиль: лимит членов семьи, переключение профиля, Premium CTA, предпочтения — **`ProfilePage`**.
- Карусель членов семьи — **`MemberCarousel`**.
- Онбординг / форма ребёнка — **`FamilyOnboarding`**, **`AddChildForm`**.
- Редактирование профиля ребёнка (аллергии, лайки/дизлайки) — **`ChildProfileEditPage`**, **`ProfileEditSheet`**.
- План: неделя / заблокированные дни — **`MealPlanPage`** (при unified открывается глобальный paywall вместо `WeekPreviewPaywallSheet`).
- Избранное: лимит — **`useFavorites`** → глобальный paywall (лист `FavoritesLimitSheet` не монтируется при unified).
- Рецепт: список продуктов, план недели — **`RecipePage`**.
- Чат: лимиты и локальный paywall — **`ChatPage`**, план в сообщении — **`ChatMessage`**.
- SOS / статьи — **`SosTiles`**, **`ArticlesPage`**.
- Пул рецептов — **`PoolExhaustedSheet`**.
- Управление подпиской — **`SubscriptionManagePage`**.

## Переключатель стратегии

| Режим | Как включить |
|--------|----------------|
| **Unified (default)** | Ничего не задавать или `VITE_FF_UNIFIED_PAYWALL=true` |
| **Legacy** | `VITE_FF_UNIFIED_PAYWALL=false` |

Дополнительно при legacy: снова доступны **`WeekPreviewPaywallSheet`** (если `VITE_FF_WEEK_PAYWALL_PREVIEW` не `false`) и **`FavoritesLimitSheet`**.

## Legacy (не удалено)

- **`LegacyPaywall.tsx`** — контекстный UI по `paywallReasonCopy`.
- **`WeekPreviewPaywallSheet.tsx`**, **`FavoritesLimitSheet.tsx`**, **`SosPaywallModal.tsx`** — остаются в репозитории; при unified часть из них не используется как основной путь.

## Документация

- **`docs/architecture/domain-map.md`** — блок Subscription & Trial.
- **`docs/analytics/analytics-system.md`** — события paywall (уточнены properties).
- **`docs/dev/legal-copy-and-auth-consent.md`** — юртексты, чекбокс на регистрации, сноска согласия под оплатой (`PaywallLegalConsentNote`).

## Юридическое усиление (март 2026)

- Сноска «Оплачивая подписку…» вынесена в **`PaywallLegalConsentNote`** (ссылки через `Link`).
- Копирайт paywall слегка смягчён в **`unifiedPaywallCopy.ts`** (без медицинских обещаний в подзаголовке/буллетах).
- Верх unified paywall облегчён: компактный заголовок (`text-xl`), короткий подзаголовок, без отдельного блока «Free vs Premium»; буллеты и формулировки — только в **`unifiedPaywallCopy.ts`**.
- При **`paywallCustomMessage`** (например лимит аллергий на Free) текст показывается **под иконкой короны** вместо пары заголовок/подзаголовок; отдельного верхнего цветного блока нет.
- Формулировки про пробный период в UI paywall: **`PAYWALL_TRIAL_ALREADY_USED`**, **`PAYWALL_TRIAL_ACTIVE_HINT`**, напоминания об окончании — в **`unifiedPaywallCopy.ts`** (вместо слова «Триал» в пользовательских строках).
- Доп. пункты в канонических юртекстах: as is, изменение сервиса и документов (`TermsContent`), срок хранения (`PrivacyContent`), возвраты (`SubscriptionContent`); см. **`docs/dev/legal-copy-and-auth-consent.md`**.

## Цены подписки (₽) и оплата Т-Банк

- **Клиент (отображение и CTA):** `src/utils/subscriptionPricing.ts` — `SUBSCRIPTION_PRICES`, подпись кнопки `paywallSubscribeCtaLabel`, эквивалент года в месяц `YEARLY_PER_MONTH`.
- **Выбор плана в paywall:** `src/components/subscription/PaywallSubscriptionPlans.tsx` (используют `UnifiedPaywall` и `LegacyPaywall`). По умолчанию выбран **год**.
- **Edge (копейки для Init и сверки webhook):** `supabase/functions/_shared/subscriptionPricing.json` — те же числа, что в `SUBSCRIPTION_PRICES`; импортируют **`create-payment`** и **`payment-webhook`**.

## Лимиты подписки и скрытые Premium-ограничения (март 2026)

- **Единая конфигурация лимитов тарифов:** `src/utils/subscriptionRules.ts` (в т.ч. `PREMIUM_TRIAL_CHAT_DAILY_LIMIT`, `PREMIUM_TRIAL_HELP_DAILY_LIMIT`, профили 1 / 7, аллергии, likes/dislikes).
- **Зеркало для Edge:** `supabase/functions/_shared/subscriptionLimits.ts` (синхронизировать при смене чисел).
- **Суточные лимиты Premium/Trial (не в paywall):** 20 успешных `chat_recipe` и 20 `help` за сутки UTC — счётчик `usage_events` + `get_usage_count_today`; проверка на Edge в `deepseek-chat` (ответ `PREMIUM_DAILY_LIMIT_REACHED`); клиент `useSubscription` + мягкий UI `FriendlyLimitDialog`, события `premium_chat_limit_reached` / `premium_help_limit_reached`.
- **Профили и теги:** лимиты на UI и в `useMembers` (`memberPayloadLimits.ts`); на БД — триггер `20260329120000_members_subscription_limits_trigger.sql`.
- **Free «Добавить профиль»:** при достижении лимита открывается paywall без экрана создания (`ProfilePage`, `HomePage`, редирект с `/profile/child/new` в `ChildProfileEditPage`).
- **Paywall-копирайт:** в unified bullets и `paywallReasonCopy` указано **до 7 профилей** (скрытые 20/20 в маркетинг не выносились).
