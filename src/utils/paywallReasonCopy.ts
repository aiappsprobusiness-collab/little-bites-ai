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

const PLAN_WEEK_BULLETS: readonly string[] = [
  "Меню на каждый день недели",
  "Список продуктов из плана",
  "Подбор под профиль ребёнка",
  "Замена блюд по слотам",
];

const HELP_SECTION_BULLETS: readonly string[] = [
  "Рекомендации по прикорму",
  "Советы по возрасту",
  "Вопросы питания и стула",
  "Подбор решений под ситуацию",
];

const FALLBACK: PaywallReasonCopy = {
  title: "Все возможности приложения",
  body: "Полный доступ ко всем функциям сервиса для вашей семьи.",
  bullets: [
    "До 7 профилей членов семьи",
    "Семейный режим",
    "Замена и автозамена блюд",
    "Генерация рецептов без лимита",
    "Раздел «Помощь маме»",
    "Список продуктов",
    "Безлимитное избранное",
  ],
};

const COPY: Record<PaywallReasonKey, PaywallReasonCopy> = {
  week_preview: {
    title: "План на всю неделю",
    body: "Семь дней меню и удобные инструменты планирования — в Premium.",
    bullets: PLAN_WEEK_BULLETS,
  },
  plan_week_locked: {
    title: "План на всю неделю",
    body: "Семь дней меню и удобные инструменты планирования — в Premium.",
    bullets: PLAN_WEEK_BULLETS,
  },
  plan_refresh: {
    title: "Обновление меню",
    body: "Пересоберите день или неделю без дневных ограничений Premium.",
    bullets: [
      "Новый подбор блюд по запросу",
      "Учёт возраста и ограничений профиля",
      "Согласованность с планом на неделю",
      "Без лимита пересборок в Premium",
    ],
  },
  plan_fill_day: {
    title: "Обновление меню",
    body: "Пересоберите день или неделю без дневных ограничений Premium.",
    bullets: [
      "Новый подбор блюд по запросу",
      "Учёт возраста и ограничений профиля",
      "Согласованность с планом на неделю",
      "Без лимита пересборок в Premium",
    ],
  },
  meal_replace: {
    title: "Замена блюда",
    body: "Быстро замените блюдо в плане на день или неделю.",
    bullets: [
      "Автоматическая замена блюда",
      "Учёт особенностей выбранного профиля",
      "Выбор из избранных рецептов",
      "Замена блюда вручную",
    ],
  },
  shopping_list: {
    title: "Список продуктов",
    body: "Все ингредиенты из меню в одном списке.",
    bullets: [
      "Автоматическая сборка списка",
      "Объединение одинаковых продуктов",
      "Удобная сортировка по категориям",
      "Возможность поделиться списком",
    ],
  },
  limit_chat: {
    title: "Генерация рецептов с ИИ",
    body: "В Free — 2 запроса в день, в Premium — без ограничений.",
    bullets: [
      "Генерация рецептов по запросу",
      "Учёт возраста и профиля",
      "Учёт аллергий и предпочтений",
      "Более разнообразные блюда",
    ],
  },
  help_limit: {
    title: "Помощь маме",
    body: "Доступ ко всем функциям раздела.",
    bullets: HELP_SECTION_BULLETS,
  },
  generate_recipe: {
    title: "Генерация рецептов с ИИ",
    body: "В Free — 2 запроса в день, в Premium — без ограничений.",
    bullets: [
      "Генерация рецептов по запросу",
      "Учёт возраста и профиля",
      "Учёт аллергий и предпочтений",
      "Более разнообразные блюда",
    ],
  },
  sos_topic_locked: {
    title: "Помощь маме",
    body: "Разбор ситуаций и рекомендации во всех темах раздела.",
    bullets: HELP_SECTION_BULLETS,
  },
  sos_premium_feature: {
    title: "Помощь маме",
    body: "Доступ ко всем функциям раздела.",
    bullets: HELP_SECTION_BULLETS,
  },
  add_child_limit: {
    title: "Несколько детей",
    body: "Отдельный профиль и меню для каждого малыша.",
    bullets: [
      "Несколько профилей в одном аккаунте",
      "Свой возраст и ограничения у каждого",
      "Меню и чат с контекстом выбранного ребёнка",
      "Быстрый выбор профиля перед генерацией",
    ],
  },
  switch_child: {
    title: "Переключение профилей",
    body: "Готовьте для любого члена семьи с учётом его особенностей.",
    bullets: [
      "Быстро выбрать профиль перед генерацией",
      "Учёт аллергий и ограничений",
      "Учёт предпочтений и возраста",
      "Свой контекст для каждого ребёнка",
    ],
  },
  allergies_locked: {
    title: "Несколько аллергий",
    body: "Все ограничения в профиле — меню и чат их учитывают.",
    bullets: [
      "Несколько аллергенов на профиль",
      "Исключения при генерации меню",
      "Безопасный подбор блюд",
      "Согласованность плана и чата",
    ],
  },
  preferences_locked: {
    title: "Предпочтения ребёнка",
    body: "Точнее подбор, когда учтены любимое и нежелательное.",
    bullets: [
      "Любимые продукты в профиле",
      "Учёт того, что ребёнок не ест",
      "Меню ближе к привычкам семьи",
      "Меньше конфликтов за столом",
    ],
  },
  favorites_limit: {
    title: "Избранное без лимита",
    body: "Сохраняйте столько рецептов, сколько нужно.",
    bullets: [
      "Неограниченное число рецептов",
      "Добавление в план из избранного",
      "Доступ с любого профиля",
      "Удобная история понравившихся блюд",
    ],
  },
  new_product: {
    title: "Прикорм и новые продукты",
    body: "Подсказки по вводу продуктов и наблюдению за реакциями.",
    bullets: [
      "Рекомендации по поэтапному вводу",
      "На что обратить внимание после пробы",
      "Связь с планом питания",
      "Персонально по возрасту ребёнка",
    ],
  },
  article_locked: {
    title: "База знаний",
    body: "Статьи о питании и прикорме — в подписке.",
    bullets: [
      "Полный доступ к материалам",
      "Актуальные темы о детском питании",
      "Удобная навигация по разделам",
      "Дополняет план и раздел помощи",
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
    /** Дополнительная строка под body не используется — весь контекст в title + body + буллетах. */
    subtitle: "",
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

/** @deprecated Используйте только title/body/bullets из getPaywallReasonCopy; глобальный подзаголовок отключён. */
export const SHARED_SUBTITLE = "";
