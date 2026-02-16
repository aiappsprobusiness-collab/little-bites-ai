import type { ComponentType } from "react";
import { Baby, UtensilsCrossed, Apple, AlertCircle, Clock, Droplets, ClipboardList, AlertTriangle } from "lucide-react";

/** Порядок: Ввод продукта, Аллергия, Стул, Срыгивание, Не хочет есть, График, Дневник, Срочная помощь. */
export const SOS_TOPICS: {
  id: string;
  label: string;
  emoji: string;
  icon: ComponentType<{ className?: string }>;
}[] = [
  { id: "new_food", label: "Ввод нового продукта", emoji: "", icon: Apple },
  { id: "allergy", label: "Аллергия или реакция", emoji: "", icon: AlertCircle },
  { id: "constipation_diarrhea", label: "Стул малыша", emoji: "", icon: Baby },
  { id: "spitting_up", label: "Срыгивание", emoji: "", icon: Droplets },
  { id: "food_refusal", label: "Не хочет есть", emoji: "", icon: UtensilsCrossed },
  { id: "routine", label: "График кормления", emoji: "", icon: Clock },
  { id: "food_diary", label: "Дневник питания", emoji: "", icon: ClipboardList },
  { id: "urgent_help", label: "Срочная помощь", emoji: "", icon: AlertTriangle },
];

export const SOS_TOPIC_IDS = new Set(SOS_TOPICS.map((t) => t.id));

/** Бесплатные SOS-опции для Free (2 шт.). Остальные — Premium. */
export const FREE_SOS_TOPIC_IDS = new Set(["constipation_diarrhea", "new_food"]);

export function getTopicById(id: string | undefined): (typeof SOS_TOPICS)[number] | null {
  if (!id) return null;
  return SOS_TOPICS.find((t) => t.id === id) ?? null;
}

/** Персонализированные описания для экрана категории. */
export const SOS_TOPIC_DESCRIPTIONS: Record<string, string> = {
  constipation_diarrhea:
    "Опишите частоту, консистенцию и изменения. Я подскажу, норма это или стоит обратить внимание.",
  new_food:
    "Напишите возраст малыша и продукт. Подскажу, как безопасно вводить.",
  allergy:
    "Опишите реакцию и после какого продукта она появилась.",
  food_refusal:
    "Опишите ситуацию — когда и как малыш отказывается от еды.",
  routine:
    "Напишите возраст малыша и текущий режим питания.",
  spitting_up:
    "Опишите, как часто происходит и в каком объеме.",
  food_diary:
    "Запишите, что ел малыш и как себя чувствовал после.",
  urgent_help:
    "Опишите симптомы. Я подскажу, требует ли ситуация срочной медицинской помощи.",
};

/** Чипсы для быстрого выбора (строго по ТЗ). */
export const SOS_TOPIC_CHIPS: Record<string, string[]> = {
  constipation_diarrhea: [
    "Зеленый 2 дня",
    "Жидкий после прикорма",
    "Раз в 3 дня — нормально?",
    "С прожилками",
  ],
  new_food: [
    "Как вводить яйцо?",
    "Можно ли рыбу в 8 месяцев?",
    "Сколько давать в первый раз?",
    "Как понять, что аллергии нет?",
  ],
  allergy: [
    "Сыпь после яблока",
    "Покраснели щеки",
    "Зуд после нового продукта",
    "Через сколько проходит?",
  ],
  food_refusal: [
    "Отказывается от прикорма",
    "Ест только пюре",
    "Кидает еду",
    "Плачет во время кормления",
  ],
  routine: [
    "Сколько раз кормить в 6 месяцев?",
    "Ночные кормления — норма?",
    "Как перейти на 3 приема?",
    "Нужны ли перекусы?",
  ],
  spitting_up: [
    "Срыгивает после каждого кормления",
    "Немного — это нормально?",
    "До какого возраста допустимо?",
    "Когда это опасно?",
  ],
  food_diary: [
    "Ел кабачок — появилась сыпь",
    "После каши болит живот",
    "Ввел новый продукт сегодня",
    "Отказался от обеда",
  ],
  urgent_help: [
    "Кровь в стуле",
    "Высокая температура и понос",
    "Сильная рвота",
    "Сильная сыпь и отек",
  ],
};

/** Краткое описание на карточке главной страницы. */
export const SOS_TOPIC_CARD_DESCRIPTIONS: Record<string, string> = {
  constipation_diarrhea: "Как понять, всё ли в порядке",
  new_food: "Как безопасно начать",
  allergy: "Что делать и когда к врачу",
  food_refusal: "Причины и мягкие решения",
  routine: "Подходит ли режим возрасту",
  spitting_up: "Норма или проблема ЖКТ",
  food_diary: "Запишите кормление и получите рекомендации",
  urgent_help: "Когда нужно срочно обратиться к врачу",
};

/** Системная инструкция для «Срочная помощь» (передаётся как extraSystemSuffix). */
export const SOS_URGENT_HELP_SYSTEM_INSTRUCTION =
  "Ты даешь краткий, четкий и спокойный ответ. Если симптомы потенциально опасны (кровь в стуле, высокая температура, сильная рвота, выраженная аллергическая реакция, вялость), обязательно рекомендуй обратиться к врачу или вызвать скорую помощь. Не пугай, но указывай четкие признаки, при которых нужна медицинская помощь.";

export const sosHints: Record<string, string> = {
  constipation_diarrhea:
    "Опишите частоту, консистенцию и изменения стула",
  new_food: "Напишите возраст малыша и продукт",
  allergy: "Опишите реакцию и после какого продукта она появилась",
  food_refusal: "Опишите, когда и как малыш отказывается от еды",
  routine: "Напишите возраст и текущий режим питания",
  spitting_up: "Опишите, как часто и в каком объёме",
  food_diary: "Запишите, что ел малыш и как себя чувствовал после",
  urgent_help: "Опишите симптомы",
};

const SOS_RESPONSE_PREFIX_PATTERNS = [
  /^Здравствуйте!?\s*/i,
  /^Привет!?\s*/i,
  /Выберите\s+(профиль|ребёнка|ребенка)[^.!?]*[.!?]?\s*/i,
  /Я\s+мгновенно\s+подберу[^.!?]*[.!?]?\s*/i,
  /Сначала\s+выберите\s+профиль[^.!?]*[.!?]?\s*/i,
];

/** Удаляет типовые префиксы приветствия/просьбы выбрать профиль в начале ответа (только в первых ~200 символах). */
export function sanitizeSosResponse(text: string): string {
  if (!text || text.length < 10) return text;
  const maxHead = 220;
  const head = text.slice(0, maxHead);
  let cleaned = head;
  for (const re of SOS_RESPONSE_PREFIX_PATTERNS) {
    cleaned = cleaned.replace(re, "");
  }
  cleaned = cleaned.trimStart();
  const tail = text.slice(maxHead);
  const result = (cleaned || head) + tail;
  return result.trimStart() || text;
}

/** Убирает эмодзи из текста только для отображения. Переносы строк сохраняются. */
export function stripEmojiForDisplay(text: string): string {
  return text
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}]/gu, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}
