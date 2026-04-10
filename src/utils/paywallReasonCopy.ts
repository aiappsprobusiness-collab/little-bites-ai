/**
 * Минималистичный paywall: только title + body (до 2 строк в body, разделитель \n).
 * Аналитика: канонический id в сторе; легаси нормализуются в resolvePaywallReason.
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
  | "onboarding_second_allergy_free"
  | "preferences_locked"
  | "favorites_limit"
  | "new_product"
  | "article_locked"
  | "trial_ending_soon"
  | "trial_expired"
  | "fallback";

export interface PaywallReasonCopy {
  title: string;
  /** Две строки: [почему недоступно]\n[что станет проще] */
  body: string;
}

const PLAN_WEEK_BODY =
  "Полный план на неделю доступен в полной версии\nМы уже продумали каждый день за вас";

const COPY: Record<PaywallReasonKey, PaywallReasonCopy> = {
  week_preview: {
    title: "Хотите не думать о меню на неделю?",
    body: PLAN_WEEK_BODY,
  },
  plan_week_locked: {
    title: "Хотите не думать о меню на неделю?",
    body: PLAN_WEEK_BODY,
  },
  plan_refresh: {
    title: "А если хочется что-то другое?",
    body: "Обновление плана — в полной версии\nМеняйте блюда без лишних раздумий",
  },
  plan_fill_day: {
    title: "Хотите не думать, что готовить сегодня?",
    body: "В бесплатной версии есть лимит на генерацию\nВ полной — обновляйте план без ограничений",
  },
  meal_replace: {
    title: "Ребёнок не будет это есть? 🙈",
    body: "Быстрая замена блюда доступна в полной версии\nЗамените блюдо за секунду — без стресса",
  },
  shopping_list: {
    title: "Хотите собрать всё за один поход? 🛒",
    body: "Список покупок на неделю доступен в полной версии\nСобирайте всё за один поход без лишних раздумий",
  },
  limit_chat: {
    title: "Сегодня вы задали максимум вопросов 🙌",
    body: "В бесплатной версии есть лимит на вопросы\nС полной — можно получать помощь без ограничений",
  },
  help_limit: {
    title: "Сегодня вы уже получили помощь 🙌",
    body: "В бесплатной версии есть лимит\nС полной — можно обращаться без ограничений",
  },
  generate_recipe: {
    title: "Не нашли подходящее блюдо? 🙈",
    body: "Генерация рецептов в чате — в полной версии\nПолучайте варианты под ваш запрос",
  },
  sos_topic_locked: {
    title: "Эта тема — в полной версии",
    body: "В бесплатной версии доступны не все разделы\nВ полной — все темы помощи",
  },
  sos_premium_feature: {
    title: "Нужна расширенная поддержка?",
    body: "Этот сценарий — в полной версии\nПодсказки без ощущения тупика",
  },
  add_child_limit: {
    title: "У вас больше одного ребёнка? 👶",
    body: "В бесплатной версии доступен один профиль\nВ полной — можно добавить всю семью",
  },
  switch_child: {
    title: "Хотите переключаться между детьми? 👶",
    body: "В бесплатной версии один профиль\nВ полной — переключайтесь между детьми в один тап",
  },
  allergies_locked: {
    title: "Важно учитывать всё питание ребёнка 💛",
    body: "В бесплатной версии — одна аллергия в профиле\nВ полной — несколько, меню и советы точнее",
  },
  onboarding_second_allergy_free: {
    title: "Важно учитывать всё питание ребёнка 💛",
    body: "В бесплатной версии — одна аллергия в профиле\nВ полной — несколько, меню и советы точнее",
  },
  preferences_locked: {
    title: "У каждого ребёнка свои вкусы 🙈",
    body: "Предпочтения недоступны в бесплатной версии\nВ полной — учитываем любимое и «не ест»",
  },
  favorites_limit: {
    title: "Хотите сохранить это на потом? ⭐",
    body: "В бесплатной версии есть лимит избранного\nС полной — сохраняйте сколько нужно",
  },
  new_product: {
    title: "Новый продукт — пошагово",
    body: "Тема доступна в полной версии\nСпокойный ввод прикорма под возраст",
  },
  article_locked: {
    title: "Хотите узнать больше? 📚",
    body: "Часть материалов — в полной версии\nПроверенная информация рядом с планом",
  },
  trial_ending_soon: {
    title: "⏳ Пробный доступ скоро закончится",
    body: "Оформите полную версию\nСохраните план, замены и помощь без ограничений",
  },
  trial_expired: {
    title: "Пробный доступ закончился",
    body: "Сейчас — бесплатный план с лимитами\nОформите доступ и верните все функции",
  },
  fallback: {
    title: "Что-то не получилось? 🙈",
    body: "Эта функция недоступна на бесплатном плане\nВ полной — без этого ограничения",
  },
};

const REASON_ALIASES: Record<string, PaywallReasonKey> = {
  limit_plan_fill_day: "plan_fill_day",
  plan_goal_select: "fallback",
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
