/**
 * Минималистичный paywall: title + bodyLines (две короткие строки).
 * Аналитика: канонический id в сторе; легаси нормализуются в resolvePaywallReason.
 */

import type { LimitReachedFeature } from "@/utils/limitReachedMessages";
import { paywallBodyPair } from "@/utils/paywallBodyLines";

export type PaywallReasonKey =
  | "week_preview"
  | "plan_week_locked"
  | "add_to_plan"
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
  | "onboarding_second_allergy_free"
  | "preferences_locked"
  | "favorites_limit"
  | "new_product"
  | "trial_ending_soon"
  | "trial_expired"
  | "free_plan_overview"
  | "fallback";

export interface PaywallReasonCopy {
  title: string;
  /** [почему недоступно, что станет проще] — рендер двумя `<p>` в PaywallCopyBody */
  bodyLines: readonly [string, string];
}

const PLAN_WEEK_LINES = paywallBodyPair(
  "Полный план на неделю — в полной версии",
  "Мы уже продумали каждый день за вас",
);

const COPY: Record<PaywallReasonKey, PaywallReasonCopy> = {
  week_preview: {
    title: "Хотите не думать о меню на неделю?",
    bodyLines: PLAN_WEEK_LINES,
  },
  plan_week_locked: {
    title: "Хотите не думать о меню на неделю?",
    bodyLines: PLAN_WEEK_LINES,
  },
  add_to_plan: {
    title: "Хотите добавить это блюдо в план?",
    bodyLines: paywallBodyPair(
      "Добавление в план — в полной версии",
      "День и приём пищи — в один тап",
    ),
  },
  plan_refresh: {
    title: "А если хочется что-то другое?",
    bodyLines: paywallBodyPair(
      "Обновление плана — в полной версии",
      "Меняйте блюда, когда захочется",
    ),
  },
  plan_fill_day: {
    title: "Хотите не думать, что готовить сегодня?",
    bodyLines: paywallBodyPair(
      "В бесплатной версии есть лимит",
      "С полной — обновляйте меню без лимита",
    ),
  },
  meal_replace: {
    title: "Ребёнок не будет это есть? 🙈",
    bodyLines: paywallBodyPair(
      "Быстрая замена — в полной версии",
      "Новое блюдо за секунду, без стресса",
    ),
  },
  shopping_list: {
    title: "Хотите собрать всё за один поход? 🛒",
    bodyLines: paywallBodyPair(
      "Список покупок на неделю — в полной версии",
      "Соберёте всё за один поход в магазин",
    ),
  },
  limit_chat: {
    title: "Сегодня лимит подборов исчерпан 🙌",
    bodyLines: paywallBodyPair(
      "В бесплатной версии — до 5 подборов в день",
      "В полной — до 20 подборов в день",
    ),
  },
  help_limit: {
    title: "Сегодня вы уже получили помощь 🙌",
    bodyLines: paywallBodyPair(
      "В бесплатной версии — 2 вопроса в день",
      "В полной — до 20 вопросов в день",
    ),
  },
  generate_recipe: {
    title: "Не нашли подходящее блюдо? 🙈",
    bodyLines: paywallBodyPair(
      "Новые рецепты в чате — в полной версии",
      "Варианты, когда ничего не подходит",
    ),
  },
  sos_topic_locked: {
    title: "Эта тема — в полной версии",
    bodyLines: paywallBodyPair(
      "Не все темы доступны бесплатно",
      "В полной — помощь под любую ситуацию",
    ),
  },
  sos_premium_feature: {
    title: "Нужна расширенная поддержка?",
    bodyLines: paywallBodyPair(
      "Этот сценарий — в полной версии",
      "Поддержка, когда не знаете, что делать",
    ),
  },
  add_child_limit: {
    title: "У вас больше одного ребёнка? 👶",
    bodyLines: paywallBodyPair(
      "В бесплатной версии — один профиль",
      "В полной — можно добавить всю семью",
    ),
  },
  switch_child: {
    title: "Хотите переключаться между детьми? 👶",
    bodyLines: paywallBodyPair(
      "В бесплатной версии — один профиль",
      "В полной — переключение в один тап",
    ),
  },
  allergies_locked: {
    title: "Важно учитывать всё питание ребёнка 💛",
    bodyLines: paywallBodyPair(
      "В бесплатной версии — одна аллергия",
      "В полной — всё питание ребёнка без риска",
    ),
  },
  onboarding_second_allergy_free: {
    title: "Важно учитывать всё питание ребёнка 💛",
    bodyLines: paywallBodyPair(
      "В бесплатной версии — одна аллергия",
      "В полной — всё питание ребёнка без риска",
    ),
  },
  preferences_locked: {
    title: "У каждого ребёнка свои вкусы 🙈",
    bodyLines: paywallBodyPair(
      "Предпочтения — в полной версии",
      "Меньше «не буду это есть» за столом",
    ),
  },
  favorites_limit: {
    title: "Хотите сохранить это на потом? ⭐",
    bodyLines: paywallBodyPair(
      "В бесплатной версии есть лимит",
      "В полной — сохраняйте сколько нужно",
    ),
  },
  new_product: {
    title: "Новый продукт — пошагово",
    bodyLines: paywallBodyPair(
      "Тема доступна в полной версии",
      "Спокойный ввод прикорма под возраст",
    ),
  },
  trial_ending_soon: {
    title: "⏳ Пробный доступ скоро закончится",
    bodyLines: paywallBodyPair(
      "Оформите полную версию",
      "План, замены и помощь без ограничений",
    ),
  },
  trial_expired: {
    title: "Пробный доступ закончился",
    bodyLines: paywallBodyPair(
      "Сейчас вы на бесплатной версии",
      "Оформите доступ и продолжайте без лимитов",
    ),
  },
  free_plan_overview: {
    title: "Вы на бесплатном плане",
    bodyLines: paywallBodyPair(
      "Сейчас: план на день, чат и замены — с лимитами",
      "В полной — неделя меню, больше подборов и список покупок",
    ),
  },
  fallback: {
    title: "Эта функция — в полной версии",
    bodyLines: paywallBodyPair(
      "На бесплатном плане она недоступна",
      "В полной — без этого ограничения",
    ),
  },
};

const REASON_ALIASES: Record<string, PaywallReasonKey> = {
  limit_plan_fill_day: "plan_fill_day",
  plan_goal_select: "fallback",
  article_locked: "fallback",
  unknown: "fallback",
};

export function resolvePaywallReason(raw: string | null | undefined): PaywallReasonKey {
  if (raw == null || raw === "") return "fallback";
  if (raw in COPY) return raw as PaywallReasonKey;
  return REASON_ALIASES[raw] ?? "fallback";
}

export function getPaywallReasonCopy(reason: string | null | undefined): PaywallReasonCopy {
  return COPY[resolvePaywallReason(reason)];
}

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
