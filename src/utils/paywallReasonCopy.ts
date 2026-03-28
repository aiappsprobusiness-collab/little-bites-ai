/**
 * Контекстные заголовки, описания и буллеты для GlobalPaywall по paywall_reason.
 * Аналитика: в стор попадает канонический id; легаси-значения нормализуются в resolvePaywallReason.
 */

import type { LimitReachedFeature } from "@/utils/limitReachedMessages";

export type PaywallReasonKey =
  | "week_preview"
  | "plan_week_locked"
  | "plan_refresh"
  | "plan_fill_day"
  | "meal_replace"
  | "shopping_list"
  | "limit_chat"
  | "help_limit"
  | "generate_recipe"
  | "sos_topic_locked"
  | "sos_premium_feature"
  | "add_child_limit"
  | "switch_child"
  | "allergies_locked"
  | "preferences_locked"
  | "favorites_limit"
  | "new_product"
  | "article_locked"
  | "fallback";

export interface PaywallReasonCopy {
  title: string;
  /** Абзац под заголовком (ценность сценария). */
  body: string;
  bullets: readonly string[];
}

const SHARED_SUBTITLE = "Полный доступ ко всем функциям";

const FALLBACK: PaywallReasonCopy = {
  title: "Все возможности приложения",
  body: "Меню, чат и помощь без лишних ограничений.",
  bullets: ["Меню под ребёнка", "Замены и чат без лимитов", "Вся «Помощь маме»"],
};

const COPY: Record<PaywallReasonKey, PaywallReasonCopy> = {
  week_preview: {
    title: "План на всю неделю",
    body: "Остальные дни и список продуктов — в Premium.",
    bullets: ["Меню на 7 дней", "Список покупок", "Замена блюд"],
  },
  plan_week_locked: {
    title: "План на всю неделю",
    body: "Остальные дни и список продуктов — в Premium.",
    bullets: ["Меню на 7 дней", "Список покупок", "Замена блюд"],
  },
  plan_refresh: {
    title: "Обновите меню",
    body: "Пересборка дня и недели без дневных лимитов.",
    bullets: ["День и неделя", "Аллергии и вкусы", "Без лимитов в Premium"],
  },
  plan_fill_day: {
    title: "Обновите меню",
    body: "Пересборка дня и недели без дневных лимитов.",
    bullets: ["День и неделя", "Аллергии и вкусы", "Без лимитов в Premium"],
  },
  meal_replace: {
    title: "Замена блюда",
    body: "Подбор альтернативы под ребёнка — в Premium.",
    bullets: ["Быстрый подбор", "Учёт ограничений", "Без лимита замен"],
  },
  shopping_list: {
    title: "Список продуктов",
    body: "Ингредиенты из меню в одном списке.",
    bullets: ["Сборка из плана", "Сумма позиций", "Редактирование вручную"],
  },
  limit_chat: {
    title: "Подбор рецептов",
    body: "В Free — 2 рецепта в день; в Premium без лимита.",
    bullets: ["Безлимит в чате", "Профиль ребёнка", "Избранное без потолка"],
  },
  help_limit: {
    title: "Консультации",
    body: "В Free — 2 вопроса в день; в Premium без лимита.",
    bullets: ["«Помощь маме» без лимита", "Все темы", "С учётом возраста"],
  },
  generate_recipe: {
    title: "Рецепт в чате",
    body: "Возраст, аллергии и вкусы — в Premium.",
    bullets: ["Персональный рецепт", "Контекст профиля", "Диалог без лимита"],
  },
  sos_topic_locked: {
    title: "Подробный разбор",
    body: "Что делать сейчас — во всех темах Premium.",
    bullets: ["Пошаговые советы", "Возраст и питание", "Все блоки помощи"],
  },
  sos_premium_feature: {
    title: "Советы для вашего ребёнка",
    body: "Персонально по возрасту и питанию.",
    bullets: ["Под профиль", "Быстрые сценарии", "Полный разбор"],
  },
  add_child_limit: {
    title: "Несколько детей",
    body: "Отдельный профиль и меню на каждого.",
    bullets: ["До 10 профилей", "Своё меню", "Семья в чате и плане"],
  },
  switch_child: {
    title: "Переключение детей",
    body: "Меню и советы под выбранного ребёнка.",
    bullets: ["Один тап", "Свой контекст", "Вся семья в аккаунте"],
  },
  allergies_locked: {
    title: "Несколько аллергий",
    body: "Исключаем продукты из меню и чата.",
    bullets: ["Несколько на профиль", "Подбор блюд", "Меньше риска"],
  },
  preferences_locked: {
    title: "Вкусы ребёнка",
    body: "Любит / не любит — точнее подбор.",
    bullets: ["В профиле", "Точнее меню", "Меньше отказов"],
  },
  favorites_limit: {
    title: "Избранное без лимита",
    body: "Больше 7 рецептов и быстрый доступ.",
    bullets: ["Сколько угодно рецептов", "В план в тап", "История"],
  },
  new_product: {
    title: "Новые продукты",
    body: "Ввод и реакции — с поддержкой Premium.",
    bullets: ["Реакции", "Безопасный ввод", "Советы под ребёнка"],
  },
  article_locked: {
    title: "База знаний",
    body: "Все статьи — по подписке.",
    bullets: ["Полный доступ", "Питание и прикорм", "Обновления"],
  },
  fallback: FALLBACK,
};

/** Легаси и алиасы → канонический ключ для копирайта и аналитики. */
const REASON_ALIASES: Record<string, PaywallReasonKey> = {
  limit_plan_fill_day: "plan_fill_day",
  /** Легаси: выбор цели питания на вкладке «План» снят. */
  plan_goal_select: "fallback",
  unknown: "fallback",
};

export function resolvePaywallReason(raw: string | null | undefined): PaywallReasonKey {
  if (raw == null || raw === "") return "fallback";
  if (raw in COPY) return raw as PaywallReasonKey;
  return REASON_ALIASES[raw] ?? "fallback";
}

export function getPaywallReasonCopy(reason: string | null | undefined): PaywallReasonCopy & { subtitle: string } {
  const key = resolvePaywallReason(reason);
  const base = COPY[key];
  return {
    title: base.title,
    body: base.body,
    bullets: base.bullets,
    subtitle: SHARED_SUBTITLE,
  };
}

/** Для LIMIT_REACHED из Edge: feature → paywall_reason. */
export function paywallReasonFromLimitFeature(feature: LimitReachedFeature): PaywallReasonKey {
  switch (feature) {
    case "chat_recipe":
      return "limit_chat";
    case "help":
      return "help_limit";
    case "plan_fill_day":
      return "plan_fill_day";
    case "plan_refresh":
      return "plan_refresh";
    default:
      return "fallback";
  }
}

export { SHARED_SUBTITLE };
