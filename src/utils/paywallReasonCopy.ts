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

const SHARED_SUBTITLE =
  "Попробуйте Premium и получите полный доступ ко всем функциям.";

const FALLBACK: PaywallReasonCopy = {
  title: "Откройте все возможности приложения",
  body: "Меню, чат, «Помощь маме» и профили детей — без лишних ограничений.",
  bullets: [
    "Персональное меню под возраст и аллергии",
    "Подбор и замена блюд в один тап",
    "Все темы «Помощь маме» и безлимитный AI",
  ],
};

const COPY: Record<PaywallReasonKey, PaywallReasonCopy> = {
  week_preview: {
    title: "Получите план на всю неделю",
    body: "Меню уже почти готово — откройте остальные дни и список продуктов.",
    bullets: [
      "Меню на неделю за 30 секунд",
      "Автоматический список продуктов",
      "Замена любого блюда",
    ],
  },
  plan_week_locked: {
    title: "Получите план на всю неделю",
    body: "Меню уже почти готово — откройте остальные дни и список продуктов.",
    bullets: [
      "Меню на неделю за 30 секунд",
      "Автоматический список продуктов",
      "Замена любого блюда",
    ],
  },
  plan_refresh: {
    title: "Обновите меню под ребёнка",
    body: "Пересоберите день или неделю с учётом предпочтений и аллергий.",
    bullets: [
      "Пересборка дня и недели без лишних шагов",
      "Учёт аллергий и вкусов",
      "Без дневных лимитов в Premium",
    ],
  },
  plan_fill_day: {
    title: "Обновите меню под ребёнка",
    body: "Пересоберите день или неделю с учётом предпочтений и аллергий.",
    bullets: [
      "Пересборка дня и недели без лишних шагов",
      "Учёт аллергий и вкусов",
      "Без дневных лимитов в Premium",
    ],
  },
  meal_replace: {
    title: "Замените блюдо за 1 секунду",
    body: "Подберём альтернативу, которую ребёнок с большей вероятностью съест.",
    bullets: [
      "Мгновенный подбор альтернативы",
      "Учёт возраста и ограничений",
      "Неограниченные замены в Premium",
    ],
  },
  shopping_list: {
    title: "Получите список продуктов",
    body: "Все ингредиенты на неделю — в одном списке.",
    bullets: [
      "Сборка списка из меню",
      "Одинаковые позиции суммируются",
      "Редактирование черновика вручную",
    ],
  },
  limit_chat: {
    title: "Продолжить подбор рецептов",
    body: "Сейчас доступно 2 рецепта в день. В Premium — без ограничений.",
    bullets: [
      "Безлимитные рецепты в чате",
      "Учёт профиля ребёнка",
      "История и избранное без потолка",
    ],
  },
  help_limit: {
    title: "Продолжить консультации",
    body: "Сейчас доступно 2 вопроса в день. В Premium — без ограничений.",
    bullets: [
      "Безлимитные вопросы «Помощь маме»",
      "Все темы и разборы",
      "Ответы с учётом возраста ребёнка",
    ],
  },
  generate_recipe: {
    title: "Сгенерировать рецепт под ребёнка",
    body: "Учитываем возраст, аллергии и предпочтения.",
    bullets: [
      "Персональный рецепт в чате",
      "Аллергии и возраст в контексте",
      "Продолжение диалога без лимита в Premium",
    ],
  },
  sos_topic_locked: {
    title: "Получите подробный разбор",
    body: "Разберём ситуацию и подскажем, что делать прямо сейчас.",
    bullets: [
      "Пошаговые рекомендации по теме",
      "Учёт возраста и питания",
      "Все блоки «Помощь маме»",
    ],
  },
  sos_premium_feature: {
    title: "Получите рекомендации для вашего ребёнка",
    body: "Персональные советы на основе возраста и питания.",
    bullets: [
      "Советы под профиль ребёнка",
      "Быстрые сценарии и чипы",
      "Полный разбор в Premium",
    ],
  },
  add_child_limit: {
    title: "Добавьте всех детей",
    body: "Настройте питание для каждого ребёнка отдельно.",
    bullets: [
      "До 10 профилей детей",
      "Своё меню и настройки на каждого",
      "Семейный режим в чате и плане",
    ],
  },
  switch_child: {
    title: "Переключайтесь между детьми",
    body: "Отдельные рекомендации для каждого ребёнка.",
    bullets: [
      "Мгновенное переключение профиля",
      "Меню и советы под выбранного ребёнка",
      "Один аккаунт на всю семью",
    ],
  },
  allergies_locked: {
    title: "Учитывайте аллергии",
    body: "Исключим нежелательные продукты из меню.",
    bullets: [
      "Несколько аллергий на профиль",
      "Исключения в подборе блюд",
      "Меньше риска в меню и чате",
    ],
  },
  preferences_locked: {
    title: "Учитывайте вкусы ребёнка",
    body: "Любит и не любит — чтобы подбор блюд совпал с привычками.",
    bullets: [
      "Предпочтения в профиле",
      "Точнее подбор в меню",
      "Меньше отказов от еды",
    ],
  },
  favorites_limit: {
    title: "Сохраняйте рецепты без ограничений",
    body: "Добавляйте любимые блюда и возвращайтесь к ним в любой момент.",
    bullets: [
      "Больше 7 рецептов в избранном",
      "Быстрый доступ к любимым блюдам",
      "Добавление из избранного в план",
    ],
  },
  new_product: {
    title: "Безопасно вводите новые продукты",
    body: "Отслеживайте реакции и вводите продукты без риска.",
    bullets: [
      "Отслеживание реакции ребёнка",
      "Безопасное введение новых продуктов",
      "Индивидуальные рекомендации",
    ],
  },
  article_locked: {
    title: "Читайте все материалы базы знаний",
    body: "Статьи для подписчиков — с практическими советами.",
    bullets: [
      "Полный доступ к статьям",
      "Темы по питанию и прикорму",
      "Обновления базы знаний",
    ],
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
