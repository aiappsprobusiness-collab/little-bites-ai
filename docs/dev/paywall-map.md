# Карта Paywall (Free vs Premium / Trial)

Документ для разработки и для внешних моделей: **какие действия** у бесплатного пользователя открывают paywall, **какие поверхности** используются, **где хранится** состояние и **канонические ключи** `paywall_reason`.

## Термины и доступ

| Понятие | Описание |
|--------|----------|
| **Free** | Нет активного trial и нет действующей платной подписки (`profiles_v2`). |
| **Trial / Premium** | `hasAccess === true` в `useSubscription` — продуктовые лимиты как у **paid** в `subscriptionRules`. |
| **`hasAccess`** | `hasTrialAccess \|\| hasPremiumAccess` (`src/hooks/useSubscription.tsx`). |

### Лимиты Free (централизованно)

Файл: `src/utils/subscriptionRules.ts` — `SUBSCRIPTION_LIMITS.free`.

| Область | Free |
|--------|------|
| Профили (создание / активные) | 1 |
| Аллергии на профиль | 1 |
| Теги «любит» / «не любит» | 0 (предпочтения выключены) |
| Блоки Help (разблокировано) | 3 |
| Запросы «Помощь маме» в сутки | 2 (`feature`: `help`) |
| Генерации рецепта в чате в сутки | 2 (`feature`: `chat_recipe`) |
| Избранное | 7 рецептов (см. `favoritesLimit` в `useSubscription`) |

---

## Главная модалка Paywall

- **Точка входа:** `src/components/subscription/Paywall.tsx`.
- **По умолчанию:** `UnifiedPaywall` (если `VITE_FF_UNIFIED_PAYWALL !== "false"`).
- **Откат:** `LegacyPaywall` при `VITE_FF_UNIFIED_PAYWALL=false`.

### Копирайт и единый стиль (2026)

- **Контекст по причине:** для `UnifiedPaywall` без `paywallCustomMessage` заголовок, абзац и буллеты берутся из **`getPaywallReasonCopy(paywallReason)`** (`paywallReasonCopy.ts`).
- **Структура текста:** ситуация (узнавание) → пояснение ограничения Free и ценности полной версии → три буллета (в т.ч. мягкое предложение trial / полный доступ). CTA и тарифы не зашиваются в буллеты как отдельные кнопки — они внизу модалки.
- **Онбординг вторая аллергия:** отдельные строки в `onboardingSecondAllergyPaywallCopy.ts`.
- **Мягкая замена блюда:** `replaceMealPaywallCopy.ts` (modal до trial).
- **Кастомные врезки** (дневник, лимиты из Edge, лимит семьи): `paywallCustomMessage` + те же буллеты по `paywall_reason`; общий текст лимита семьи — `src/constants/paywallCustomMessages.ts` (`PAYWALL_ADD_CHILD_CUSTOM_MESSAGE`). Сообщения про вторую аллергию вне онбординга — `friendlyLimitCopy.ts` (`FREE_ALLERGY_PAYWALL_MESSAGE`).
- **`unifiedPaywallCopy.ts`:** футер, подсказки trial; запасной «герой» на случай внешних импортов — основной UI использует `paywallReasonCopy`.

### Zustand (`src/store/useAppStore.ts`)

| Поле | Назначение |
|------|------------|
| `showPaywall` | Открыта ли глобальная модалка (хост в `App.tsx`). |
| `paywallReason` | Канонический id для аналитики (`paywall_view`, клики). |
| `paywallCustomMessage` | Доп. текст поверх шаблона (дневник, лимиты, онбординг). |

При `setShowPaywall(false)` стор сбрасывает `paywallCustomMessage` и `paywallReason`.

### Аналитика (типично)

- `paywall_view`, `paywall_primary_click`, `paywall_secondary_click` — `properties.paywall_reason`.
- `paywall_text` / `trackPaywallTextShown` — один канонический ключ **`paywall_reason`** (например `limit_chat`), плюс `surface` (`unified_paywall`, `legacy_paywall`, `week_preview_sheet`, `favorites_limit_sheet`, …). См. `src/utils/paywallTextAnalytics.ts`.

Копирайт и ключи: `src/utils/paywallReasonCopy.ts` (`PaywallReasonKey`, `resolvePaywallReason`).

---

## Канонические `paywall_reason` и триггеры

| `paywall_reason` | Действие / ситуация (Free или общий гейт) | Где задаётся (ориентиры) |
|------------------|------------------------------------------|---------------------------|
| `week_preview` | Превью недели, оплата из sheet превью | `WeekPreviewPaywallSheet`, `MealPlanPage` |
| `plan_week_locked` | Неделя / «в план» без доступа | `MealPlanPage`, `RecipePage`, `ChatMessage` |
| `plan_refresh` | Лимит пересборки плана | `runReplaceOccupiedMealSlot.ts`, `MealPlanPage` |
| `plan_fill_day` | Лимит заполнения дня / плана | `usePlanGenerationJob.ts`, Edge `LIMIT_REACHED` → `paywallReasonFromLimitFeature` |
| `meal_replace` | Замена блюда (жёсткий гейт) | `runReplaceOccupiedMealSlot.ts`, `MealPlanPage` |
| `shopping_list` | Список покупок | `FavoritesPage`, `RecipePage`, `MealPlanPage` |
| `limit_chat` | Дневной лимит чата рецептов | `ChatPage`, Edge `chat_recipe` |
| `help_limit` | Дневной лимит Help | `ChatPage`, `SosTiles`, Edge `help` |
| `generate_recipe` | Из `PoolExhaustedSheet`: «сгенерировать в чате» для Free | `PoolExhaustedSheet.tsx` |
| `sos_topic_locked` | Тема с `requiredTier: "paid"` | `SosTiles`, `SosScenarioScreen` |
| `sos_premium_feature` | Премиум-чипы, часть SOS, дневник (часто + custom message) | `SosTiles`, `FoodDiary` |
| `add_child_limit` | Второй ребёнок / лимит профилей | онбординг, `HomePage`, `ChildProfileEditPage`, `ProfilePage`, формы |
| `switch_child` | Переключение профиля | `MemberSelectorButton`, `MemberCarousel`, `ProfilePage` |
| `allergies_locked` | Вторая и далее аллергия | `ChildProfileEditPage` |
| `onboarding_second_allergy_free` | Вторая аллергия в онбординге (отдельный UI в Unified) | `ProfileEditSheet`, `AddChildForm` |
| `preferences_locked` | Любимое / «не любит» | `ChildProfileEditPage`, `ProfilePage` |
| `favorites_limit` | Лимит избранного | `useFavorites`, `ChatMessage`; при `!FF_UNIFIED_PAYWALL` ещё `FavoritesLimitSheet` |
| `article_locked` | Статьи | `ArticlesPage` |
| `trial_ending_soon` | Конец trial ≤24ч → из lifecycle модалки | `TrialLifecycleModalsHost` |
| `trial_expired` | После trial → из lifecycle модалки | `TrialLifecycleModalsHost` |
| `fallback` | Нет причины, неизвестный ключ, бейдж в чате | `SubscriptionManagePage`, `ProfilePage`, `ChatPage` (`openSubscriptionFromBadge`) |

### Легаси-алиасы

`src/utils/paywallReasonCopy.ts` — `REASON_ALIASES` (например `limit_plan_fill_day` → `plan_fill_day`).

### Edge `LIMIT_REACHED` → причина

`paywallReasonFromLimitFeature` в `paywallReasonCopy.ts`:

- `chat_recipe` → `limit_chat`
- `help` → `help_limit`
- `plan_fill_day` → `plan_fill_day`
- `plan_refresh` → `plan_refresh`

### Зарезервированный ключ без вызова в коде

В `paywallReasonCopy.ts` есть копирайт для `new_product`, но **`setPaywallReason("new_product")` в кодовой базе не используется** — при необходимости подключить сценарий явно.

---

## Дополнительные поверхности (не только глобальная модалка)

| Компонент / экран | Описание |
|-------------------|----------|
| `WeekPreviewPaywallSheet` | Sheet с превью дня; отдельный `paywall_view` с `paywall_surface: week_preview_sheet`; оплата открывает глобальный Paywall с `week_preview`. |
| `PoolExhaustedSheet` | Исчерпан пул вариантов в слоте; для Free «в чат» → глобальный Paywall `generate_recipe`. |
| `ReplaceMealSoftPaywallModal` | Мягкий экран перед заменой блюда; тексты `src/constants/replaceMealPaywallCopy.ts`. |
| `FriendlyLimitDialog` | Мягкий диалог без полноценного paywall (напр. лимит Help у Premium) — `SosTiles`, `HomePage`, `ChatPage`, `ProfilePage`. |
| `FreeVsPremiumModal` | Таблица сравнения; из `MealPlanPage` при `FF_WEEK_PAYWALL_PREVIEW && !FF_UNIFIED_PAYWALL`. |
| `TrialLifecycleModal` | Предупреждение о конце trial → по кнопке открывает глобальный Paywall с `trial_*`. |
| `TrialActivatedModal` | После активации trial (`trial_onboarding_*` события). |
| `FavoritesLimitSheet` | В `App.tsx` рендерится **только при** `!FF_UNIFIED_PAYWALL`; при unified лимит избранного идёт в UnifiedPaywall из хука. |

---

## SOS / Help: что бесплатно

- `src/constants/sos.ts` — для сетки заявлены бесплатные id: `food_refusal`, `urgent_help`.
- **Источник правды по блокировке карточек:** `src/data/sosTopics.ts` — поле `requiredTier: "free" | "paid"`.

Заблокированная тема → обычно `sos_topic_locked` + глобальный Paywall.

---

## Хранение данных

| Данные | Место |
|--------|--------|
| Статус подписки, trial, premium | Таблица **`profiles_v2`** (Supabase): `status`, `premium_until`, `trial_until`, `trial_used`, `last_active_member_id`, … |
| Использование за сутки | **`usage_events`** + RPC **`get_usage_count_today`** (`p_feature`: `chat_recipe`, `help`, …) |
| Подтверждённый план (месяц/год) | RPC **`get_my_latest_confirmed_subscription`** |
| «Уже видел» модалки trial | `src/utils/trialLifecycleStorage.ts`, `trialActivatedModalStorage` (localStorage по `user.id`) |
| Zustand `useAppStore` | Paywall-поля **не персистятся** в localStorage (`partialize` не включает `showPaywall` / причины). |

---

## Известные краевые случаи

1. **Локальный state paywall** на части экранов (`ChatPage`, `ArticlesPage`, `SosTiles` как `paywallOpen`, `HomePage`) — поведение то же, обёртка локальная.
2. **«Сегодня спрашивают»** в `SosTiles`: при тапе по премиум-вопросу без доступа выставляется `paywall_reason` = `sos_premium_feature`.
3. **Бейдж тарифа** в шапке чата (`openSubscriptionFromBadge`) открывает paywall с **обнулённой** причиной → **`fallback`**.

---

## Ключевые файлы для изменений

| Назначение | Путь |
|------------|------|
| Причины и тексты | `src/utils/paywallReasonCopy.ts`, `src/utils/unifiedPaywallCopy.ts`, `src/utils/onboardingSecondAllergyPaywallCopy.ts`, `src/constants/replaceMealPaywallCopy.ts`, `src/constants/paywallCustomMessages.ts`, `src/utils/limitReachedMessages.ts`, `src/utils/friendlyLimitCopy.ts` |
| Флаги | `src/config/featureFlags.ts` (`FF_UNIFIED_PAYWALL`, `FF_WEEK_PAYWALL_PREVIEW`) |
| UI | `src/components/subscription/Paywall.tsx`, `UnifiedPaywall.tsx`, `LegacyPaywall.tsx` |
| Лимиты | `src/utils/subscriptionRules.ts` |
| Подписка в приложении | `src/hooks/useSubscription.tsx` |
| Аналитика текстов | `src/utils/paywallTextAnalytics.ts` |

---

*При изменении поведения paywall обновляйте этот файл в том же changeset, что и код.*
