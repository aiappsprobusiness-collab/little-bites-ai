/**
 * Fallback на клиенте: если бэкенд не вернул сообщение редиректа/нерелевантности,
 * показываем правильный текст по содержимому запроса (те же ключевые слова, что на Edge).
 */

/** topicKey совпадает с backend (assistantTopicDetect) и /sos?scenario=; topicShortTitle — для карточки в чате. */
const ASSISTANT_TOPIC_KEYWORDS: Array<{ topicKey: string; topicTitle: string; topicShortTitle: string; keywords: string[] }> = [
  { topicKey: "new_food", topicTitle: "Как безопасно ввести новый продукт?", topicShortTitle: "Введение продуктов", keywords: ["прикорм", "ввести продукт", "вводить продукт", "новый продукт", "как вводить", "можно ли давать", "в каком возрасте", "первый прикорм", "ввод прикорма", "вводить яйцо", "вводить рыбу", "давать в 6 месяцев", "давать в 8 месяцев"] },
  { topicKey: "allergy", topicTitle: "Аллергия или реакция — что делать?", topicShortTitle: "Аллергия на продукты", keywords: ["аллергий", "аллергия на", "сыпь на", "сыпь после", "реакция на продукт", "покраснели щеки", "зуд после", "реакция на молочку", "реакция на молоко"] },
  { topicKey: "constipation_diarrhea", topicTitle: "Стул малыша: норма или повод волноваться?", topicShortTitle: "Стул малыша", keywords: ["стул малыша", "стул ребёнка", "стул ребенка", "запор", "понос", "жидкий стул", "зеленый стул", "кал", "жкт", "кишечник", "запор у ребёнка", "понос у ребёнка"] },
  { topicKey: "spitting_up", topicTitle: "Срыгивания: норма или проблема?", topicShortTitle: "Срыгивания", keywords: ["срыгиван", "срыгивает", "срыгнул", "срыгивание"] },
  { topicKey: "food_refusal", topicTitle: "Ребёнок не хочет есть — что делать?", topicShortTitle: "Ребёнок не ест", keywords: ["малоежка", "не хочет есть", "отказ от еды", "отказывается от еды", "отказывается от прикорма", "не ест", "ест только пюре", "плачет при кормлении"] },
  { topicKey: "routine", topicTitle: "График кормления: подходит ли возрасту?", topicShortTitle: "Режим кормления", keywords: ["режим кормления", "график кормления", "сколько раз кормить", "ночные кормления", "режим питания"] },
  { topicKey: "food_diary", topicTitle: "Дневник питания: записать и получить совет", topicShortTitle: "Дневник питания", keywords: ["дневник питания", "что ел ребёнок", "записать кормления"] },
  { topicKey: "urgent_help", topicTitle: "Когда срочно обращаться к врачу?", topicShortTitle: "Срочная помощь", keywords: ["срочно к врачу", "когда к врачу", "кровь в стуле", "вызвать скорую", "высокая температура", "сильная рвота"] },
];

const IRRELEVANT_KEYWORDS = [
  "погод", "курс доллар", "курс валют", "какая погода", "сколько стоит доллар",
  "расписани", "билет", "кинотеатр", "кто выиграл", "матч",
];

const MESSAGE_IRRELEVANT = "В этом чате мы помогаем подбирать блюда. Попробуйте изменить запрос, и мы предложим подходящий вариант.";

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

export type SystemHintRoute = "assistant_topic_redirect" | "assistant_irrelevant";

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

  for (const { topicKey, topicTitle, topicShortTitle, keywords } of ASSISTANT_TOPIC_KEYWORDS) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return {
        message: "Этот вопрос лучше задать во вкладке «Помощник».",
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
