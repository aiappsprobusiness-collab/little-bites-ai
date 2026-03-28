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
