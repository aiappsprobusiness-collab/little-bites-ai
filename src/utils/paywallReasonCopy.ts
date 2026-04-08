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
  | "trial_ending_soon"
  | "trial_expired"
  | "fallback";

export interface PaywallReasonCopy {
  title: string;
  /** Абзац под заголовком (ценность сценария). */
  body: string;
  bullets: readonly string[];
}

const PLAN_WEEK_BULLETS: readonly string[] = [
  "Меню на каждый день недели",
  "Подбор с учётом возраста и привычек",
  "Замена блюд, если ребёнок вдруг откажется",
  "Список покупок из плана",
];

const HELP_SECTION_BULLETS: readonly string[] = [
  "Спокойные объяснения без осуждения",
  "Прикорм, стул, отказы от еды — по шагам",
  "Подсказки с учётом возраста",
  "Меньше тревоги в непонятных ситуациях",
];

const FALLBACK: PaywallReasonCopy = {
  title: "Всё, чтобы питание было спокойнее",
  body: "Полный доступ: план, замены, чат и помощь — в одном месте, без лишней суеты.",
  bullets: [
    "До 7 профилей для семьи",
    "План на неделю и быстрые замены",
    "Чат и подсказки без дневного лимита",
    "Список покупок и избранное без ограничений",
  ],
};

const COPY: Record<PaywallReasonKey, PaywallReasonCopy> = {
  week_preview: {
    title: "Хотите не думать о меню на неделю?",
    body: "Мы составим план питания на каждый день с учётом ребёнка и ваших предпочтений",
    bullets: PLAN_WEEK_BULLETS,
  },
  plan_week_locked: {
    title: "Хотите не думать о меню на неделю?",
    body: "Мы составим план питания на каждый день с учётом ребёнка и ваших предпочтений",
    bullets: PLAN_WEEK_BULLETS,
  },
  plan_refresh: {
    title: "Обновить меню без нервов",
    body: "Пересоберите день или неделю столько раз, сколько нужно — без дневного лимита.",
    bullets: [
      "Новый подбор блюд, когда хочется разнообразия",
      "Учёт возраста и ограничений профиля",
      "Согласованность с планом на неделю",
      "Спокойные пересборки без «закончились попытки»",
    ],
  },
  plan_fill_day: {
    title: "Обновить меню без нервов",
    body: "Пересоберите день или неделю столько раз, сколько нужно — без дневного лимита.",
    bullets: [
      "Новый подбор блюд, когда хочется разнообразия",
      "Учёт возраста и ограничений профиля",
      "Согласованность с планом на неделю",
      "Спокойные пересборки без «закончились попытки»",
    ],
  },
  meal_replace: {
    title: "Замена за секунду",
    body: "Ребёнок капризничает? Подберите другое блюдо в пару тапов — на день или на неделю.",
    bullets: [
      "Автоматическая замена из подходящих вариантов",
      "Учёт профиля ребёнка",
      "Ручной выбор из избранного",
      "Меньше стресса за столом",
    ],
  },
  shopping_list: {
    title: "Список без лишних походов",
    body: "Список покупок уже готов. Получите всё сразу на неделю без лишних походов и раздумий",
    bullets: [
      "Сборка из меню в один тап",
      "Одинаковые продукты складываются вместе",
      "Удобные категории",
      "Можно поделиться с близкими",
    ],
  },
  limit_chat: {
    title: "Сегодня вы задали максимум вопросов 🙌",
    body: "В полной версии можно задавать без ограничений и получать помощь в любой ситуации",
    bullets: [
      "Идеи блюд под ваш запрос",
      "Учёт возраста и профиля",
      "Аллергии и предпочтения в контексте",
      "Меньше «что бы такого приготовить»",
    ],
  },
  help_limit: {
    title: "Помощь рядом — без очереди",
    body: "Раздел «Помощь маме» открыт полностью: задавайте вопросы, пока это нужно именно вам.",
    bullets: HELP_SECTION_BULLETS,
  },
  generate_recipe: {
    title: "Сегодня вы задали максимум вопросов 🙌",
    body: "В полной версии можно задавать без ограничений и получать помощь в любой ситуации",
    bullets: [
      "Идеи блюд под ваш запрос",
      "Учёт возраста и профиля",
      "Аллергии и предпочтения в контексте",
      "Меньше «что бы такого приготовить»",
    ],
  },
  sos_topic_locked: {
    title: "Помощь рядом — без очереди",
    body: "Все темы раздела — чтобы быстрее найти ответ в вашей ситуации.",
    bullets: HELP_SECTION_BULLETS,
  },
  sos_premium_feature: {
    title: "Помощь рядом — без очереди",
    body: "Все темы раздела — чтобы быстрее найти ответ в вашей ситуации.",
    bullets: HELP_SECTION_BULLETS,
  },
  add_child_limit: {
    title: "Несколько детей — свой план у каждого",
    body: "Добавьте всю семью. Получите план питания для каждого ребёнка с учётом возраста и предпочтений",
    bullets: [
      "Отдельный профиль под каждого малыша",
      "Свой возраст и ограничения",
      "Меню и чат с нужным контекстом",
      "Переключение в один тап",
    ],
  },
  switch_child: {
    title: "Переключайте детей в один тап",
    body: "Готовьте с учётом того, кто сейчас за столом — без путаницы в аллергиях и привычках.",
    bullets: [
      "Быстрый выбор профиля перед ответом",
      "Аллергии и непереносимости на виду",
      "Предпочтения и возраст учтены",
      "Меньше ошибок в подборе блюд",
    ],
  },
  allergies_locked: {
    title: "Несколько ограничений — больше спокойствия",
    body: "Укажите все важные аллергии: меню и чат будут их беречь.",
    bullets: [
      "Несколько аллергенов в профиле",
      "Исключения при подборе меню",
      "Спокойнее за столом",
      "План и чат говорят на одном языке",
    ],
  },
  preferences_locked: {
    title: "Учтём, что любит и что не ест",
    body: "Любимое и «не нравится» помогают подобрать меню ближе к вашей семье.",
    bullets: [
      "Любимые продукты в профиле",
      "То, что ребёнок не ест — тоже важно",
      "Меню ближе к привычкам",
      "Меньше споров из‑за тарелки",
    ],
  },
  favorites_limit: {
    title: "Избранное без потолка",
    body: "Сохраняйте любимые рецепты без ограничений, чтобы быстро возвращаться к тому, что уже понравилось ребёнку",
    bullets: [
      "Сколько угодно сохранённых блюд",
      "Добавление в план из избранного",
      "Удобно для всей семьи",
      "Понравившееся — всегда под рукой",
    ],
  },
  new_product: {
    title: "Прикорм без догадок",
    body: "Подсказки по вводу продуктов и тому, на что смотреть после пробы.",
    bullets: [
      "Поэтапный ввод без спешки",
      "На что обратить внимание после пробы",
      "Связь с вашим планом питания",
      "С учётом возраста ребёнка",
    ],
  },
  article_locked: {
    title: "База знаний — в полной версии",
    body: "Статьи о питании и прикорме, которые дополняют план и раздел помощи.",
    bullets: [
      "Материалы в удобном порядке",
      "Темы про детское питание",
      "Можно читать в своём темпе",
      "Рядом с планом и чатом",
    ],
  },
  trial_ending_soon: {
    title: "⏳ Пробный доступ заканчивается… Продолжайте пользоваться без ограничений",
    body: "Оформите полную версию, чтобы не потерять привычный ритм: план, замены и помощь останутся рядом.",
    bullets: FALLBACK.bullets,
  },
  trial_expired: {
    title: "Пробный доступ закончился",
    body: "Доступна бесплатная версия с ограничениями. Оформите полную версию, чтобы сохранить все возможности",
    bullets: FALLBACK.bullets,
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
