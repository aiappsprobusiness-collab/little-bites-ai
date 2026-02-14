import type { ComponentType } from "react";
import { Baby, UtensilsCrossed, Apple, AlertCircle, Clock, Droplets, ClipboardList } from "lucide-react";

export const SOS_TOPICS: {
  id: string;
  label: string;
  emoji: string;
  icon: ComponentType<{ className?: string }>;
}[] = [
  { id: "constipation_diarrhea", label: "Стул малыша", emoji: "🚽", icon: Baby },
  { id: "new_food", label: "Ввод нового продукта", emoji: "🥄", icon: Apple },
  { id: "food_refusal", label: "Не хочет есть", emoji: "😤", icon: UtensilsCrossed },
  { id: "allergy", label: "Аллергия или реакция", emoji: "⚠️", icon: AlertCircle },
  { id: "routine", label: "График кормления", emoji: "⏰", icon: Clock },
  { id: "spitting_up", label: "Срыгивание", emoji: "🍼", icon: Droplets },
  { id: "food_diary", label: "Дневник питания", emoji: "📋", icon: ClipboardList },
];

export const SOS_TOPIC_IDS = new Set(SOS_TOPICS.map((t) => t.id));

export function getTopicById(id: string | undefined): (typeof SOS_TOPICS)[number] | null {
  if (!id) return null;
  return SOS_TOPICS.find((t) => t.id === id) ?? null;
}

export const sosHints: Record<string, string> = {
  constipation_diarrhea:
    "Опишите, как часто бывает стул, консистенция, как давно изменилось",
  new_food: "Напишите, какой продукт хотите ввести и в каком виде",
  food_refusal:
    "Опишите, что именно отказывается есть и как давно это началось",
  allergy:
    "Опишите, что появилось (сыпь, краснота) и после чего",
  routine:
    "Опишите текущий режим: сколько раз ест, примерные объёмы",
  spitting_up:
    "Опишите, как часто и сколько примерно срыгивает",
  food_diary:
    "Укажите, чем кормили ребёнка, и я подскажу, что улучшить в следующий раз.",
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
