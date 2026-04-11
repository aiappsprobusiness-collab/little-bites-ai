/**
 * Fallback на клиенте: если бэкенд не вернул сообщение редиректа/нерелевантности,
 * показываем правильный текст по содержимому запроса (те же ключевые слова/паттерны, что на Edge).
 */

import { RUSSIAN_STOOL_KAL_PATTERN } from "../../supabase/functions/_shared/russianStoolKalPattern.ts";
import {
  CHAT_MESSAGE_ASSISTANT_REDIRECT,
  CHAT_MESSAGE_IRRELEVANT,
} from "../../supabase/functions/_shared/chatRecipeRoutingMessages.ts";

type AssistantTopicKeywordRow = {
  topicKey: string;
  topicTitle: string;
  topicShortTitle: string;
  keywords: string[];
  /** Доп. паттерны (например слово «кал» только целиком, не «калорийный»). */
  patterns?: RegExp[];
};

/** topicKey совпадает с backend (assistantTopicDetect) и /sos?scenario=; topicShortTitle — для карточки в чате. */
const ASSISTANT_TOPIC_KEYWORDS: AssistantTopicKeywordRow[] = [
  { topicKey: "new_food", topicTitle: "Как безопасно ввести новый продукт?", topicShortTitle: "Введение продуктов", keywords: ["прикорм", "ввести продукт", "вводить продукт", "новый продукт", "как вводить", "можно ли давать", "в каком возрасте", "первый прикорм", "ввод прикорма", "вводить яйцо", "вводить рыбу", "давать в 6 месяцев", "давать в 8 месяцев"] },
  { topicKey: "allergy", topicTitle: "Аллергия или реакция — что делать?", topicShortTitle: "Аллергия на продукты", keywords: ["аллергий", "аллергия на", "сыпь на", "сыпь после", "реакция на продукт", "покраснели щеки", "зуд после", "реакция на молочку", "реакция на молоко", "пятна на коже", "красные пятна", "сыпь на коже", "зуд кожи", "кожа чешется"] },
  {
    topicKey: "constipation_diarrhea",
    topicTitle: "Стул малыша: норма или повод волноваться?",
    topicShortTitle: "Стул малыша",
    keywords: ["стул малыша", "стул ребёнка", "стул ребенка", "запор", "понос", "жидкий стул", "зеленый стул", "жкт", "кишечник", "запор у ребёнка", "понос у ребёнка", "какается", "какает", "покакал", "часто какает", "диарея"],
    patterns: [RUSSIAN_STOOL_KAL_PATTERN],
  },
  { topicKey: "spitting_up", topicTitle: "Срыгивания: норма или проблема?", topicShortTitle: "Срыгивания", keywords: ["срыгиван", "срыгивает", "срыгнул", "срыгивание"] },
  { topicKey: "food_refusal", topicTitle: "Ребёнок не хочет есть — что делать?", topicShortTitle: "Ребёнок не ест", keywords: ["малоежка", "не хочет есть", "отказ от еды", "отказывается от еды", "отказывается от прикорма", "не ест", "ест только пюре", "плачет при кормлении"] },
  { topicKey: "routine", topicTitle: "График кормления: подходит ли возрасту?", topicShortTitle: "Режим кормления", keywords: ["режим кормления", "график кормления", "сколько раз кормить", "ночные кормления", "режим питания"] },
  { topicKey: "food_diary", topicTitle: "Наша тарелка: записать и получить совет", topicShortTitle: "Наша тарелка", keywords: ["дневник питания", "наша тарелка", "что ел ребёнок", "записать кормления"] },
  { topicKey: "urgent_help", topicTitle: "Когда срочно обращаться к врачу?", topicShortTitle: "Срочная помощь", keywords: ["срочно к врачу", "когда к врачу", "кровь в стуле", "вызвать скорую", "высокая температура", "сильная рвота"] },
];

const IRRELEVANT_KEYWORDS = [
  "погод", "курс доллар", "курс валют", "курс евро", "какая погода", "сколько стоит доллар",
  "расписани", "билет", "кинотеатр", "кто выиграл", "матч",
  "политик", "биткоин", "криптовалют",
];

const MESSAGE_IRRELEVANT = CHAT_MESSAGE_IRRELEVANT;

function normalize(text: string): string {
  return (text ?? "").trim().toLowerCase();
}

/**
 * Если запрос явно про тему Помощника или нерелевантен — возвращает текст сообщения для чата.
 * Иначе null (показывать ответ бэкенда или FAILED_MESSAGE).
 */
export function getRedirectOrIrrelevantMessage(userMessage: string): string | null {
  const meta = getRedirectOrIrrelevantMeta(userMessage);
  return meta?.message ?? null;
}

export type SystemHintRoute = "assistant_topic_redirect" | "assistant_irrelevant" | "curated_under_12_recipe";

export interface RedirectOrIrrelevantMeta {
  message: string;
  route: SystemHintRoute;
  topicKey?: string;
  topicTitle?: string;
  topicShortTitle?: string;
}

/**
 * Возвращает сообщение и мета для системной подсказки (редирект в Помощник или нерелевантность).
 * Используется для отображения SystemHintCard и кнопки «Перейти в тему».
 */
export function getRedirectOrIrrelevantMeta(userMessage: string): RedirectOrIrrelevantMeta | null {
  const lower = normalize(userMessage);
  if (lower.length < 2) return null;

  for (const { topicKey, topicTitle, topicShortTitle, keywords, patterns } of ASSISTANT_TOPIC_KEYWORDS) {
    const byKeyword = keywords.some((kw) => lower.includes(kw));
    const byPattern = patterns?.some((re) => re.test(lower)) ?? false;
    if (byKeyword || byPattern) {
      return {
        message: CHAT_MESSAGE_ASSISTANT_REDIRECT,
        route: "assistant_topic_redirect",
        topicKey,
        topicTitle,
        topicShortTitle,
      };
    }
  }

  if (IRRELEVANT_KEYWORDS.some((kw) => lower.includes(kw))) {
    return { message: MESSAGE_IRRELEVANT, route: "assistant_irrelevant" };
  }

  return null;
}
