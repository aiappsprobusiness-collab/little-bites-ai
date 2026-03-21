import { RUSSIAN_STOOL_KAL_PATTERN } from "../_shared/russianStoolKalPattern.ts";

/**
 * Rule-based определение темы вкладки «Помощник» по тексту запроса.
 * Используется для маршрутизации во вкладке Чат: если запрос про тему Помощника — не генерируем рецепт, а предлагаем задать вопрос во вкладке «Помощник».
 * Только явные ключевые слова/паттерны; при сомнении не матчим (fail-open в сторону рецепта).
 */

export type MatchedBy = "phrase" | "combo" | "pattern" | "keyword";

export type AssistantTopicDetectResult =
  | { matched: false }
  | { matched: true; topicKey: string; topicTitle: string; topicShortTitle: string; matchedTerms?: string[]; matchedBy?: MatchedBy };

/**
 * Нормализация текста перед детекцией: lowercase, ё→е, схлопывание пробелов, trim.
 * Используется в detectAssistantTopic() перед всеми проверками.
 */
function normalizeText(input: string): string {
  return (input ?? "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}

/** Темы вкладки «Помощник» (соответствуют sosTopics в приложении): id, title, shortTitle, phraseBank, keywords, patterns. */
const ASSISTANT_TOPICS: Array<{
  topicKey: string;
  topicTitle: string;
  topicShortTitle: string;
  phraseBank: string[];
  keywords: string[];
  patterns: RegExp[];
}> = [
  {
    topicKey: "new_food",
    topicTitle: "Как безопасно ввести новый продукт?",
    topicShortTitle: "Введение продуктов",
    phraseBank: [
      "новый продукт",
      "ввод нового продукта",
      "как вводить продукт",
      "как вводить прикорм",
      "как вводить новый продукт",
      "первый прикорм",
    ],
    keywords: [
      "прикорм", "ввести продукт", "вводить продукт", "ввод продукта", "новый продукт",
      "как вводить", "можно ли давать", "в каком возрасте", "сколько давать в первый раз",
      "первый прикорм", "порядок ввода", "ввод прикорма", "ввести прикорм",
      "вводить яйцо", "вводить рыбу", "вводить овощи", "давать в 6 месяцев",
      "давать в 8 месяцев", "давать в 7 месяцев", "с какого возраста", "первая проба",
      "возрастная норма продукта",
    ],
    patterns: [
      /можно ли\s+(давать|дать)\s+\w+\s+(в|с)\s*\d+\s*месяц/i,
      /как\s+вводить\s+\w+/i,
      /вводить\s+(яйцо|рыбу|овощи|мясо|творог)/i,
    ],
  },
  {
    topicKey: "allergy",
    topicTitle: "Аллергия или реакция — что делать?",
    topicShortTitle: "Аллергия на продукты",
    phraseBank: [
      "сыпь после еды",
      "сыпь после продукта",
      "сыпь после каши",
      "сыпь после смеси",
      "реакция на продукт",
      "реакция после еды",
      "высыпало после еды",
      "высыпало после продукта",
      "пятна после еды",
      "покраснение после еды",
      "аллергия на продукт",
      "сыпь на молочку",
      "реакция на молочку",
    ],
    keywords: [
      "аллергий", "аллергия на", "аллергия ", "сыпь на", "сыпь после", "сыпь после продукта",
      "сыпь ", "покраснение", "пятна после", "пятна от", "высыпало", "зуд ", "зуд после",
      "крапивница", "отек ", "отёк ", "реакция на продукт", "реакция на ", "реакция ",
      "покраснели щеки", "покраснение после", "краснота после", "реакция на молочку",
      "реакция на молоко", "непереносимость", "сыпь у ребёнка после", "краснота у ребёнка",
      "чешется после еды", "появилась сыпь", "высыпания",
    ],
    patterns: [
      /сыпь\s+(на|после)\s+/i,
      /сыпь.*(после|от).*(еды|продукта|каши|смеси)/i,
      /(реакция|аллергия).*(на|после).*(продукта|еды)/i,
      /(пятна|покраснение).*(после|от).*(еды|продукта)/i,
      /после.*(продукта|еды).*(сыпь|пятна|реакция|высыпало)/i,
      /реакция\s+на\s+(продукт|молоко|молочку|яйцо)/i,
      /аллерги\w*\s+у\s+ребенка/i,
      /высыпало\s+после/i,
    ],
  },
  {
    topicKey: "constipation_diarrhea",
    topicTitle: "Стул малыша: норма или повод волноваться?",
    topicShortTitle: "Стул малыша",
    phraseBank: [
      "запор после каши",
      "понос после прикорма",
      "жидкий стул",
      "редкий стул",
      "твердый стул",
      "кровь в стуле",
      "зеленый стул",
      "зеленый кал",
      "болит живот после еды",
      "вздутие после смеси",
    ],
    keywords: [
      "стул малыша", "стул ребёнка", "стул ребенка", "запор", "понос", "жидкий стул",
      "зеленый стул", "зелёный стул", "дефекаци", "жкт", "кишечник",
      "прожилки в стуле", "кровь в стуле", "слизь в стуле", "частый стул",
      "редкий стул", "стул раз в", "запор у ребёнка", "понос у ребёнка",
      "газы", "вздутие", "колики", "живот болит", "пук", "болит живот",
    ],
    patterns: [
      RUSSIAN_STOOL_KAL_PATTERN,
      /(запор|понос)\s+(у\s+)?(ребенка|малыша)/i,
      /стул\s+(стал|зеленый|жидкий|частый)/i,
      /(ребенка|малыша)\s+(запор|понос)/i,
    ],
  },
  {
    topicKey: "spitting_up",
    topicTitle: "Срыгивания: норма или проблема?",
    topicShortTitle: "Срыгивания",
    phraseBank: [],
    keywords: [
      "срыгиван", "срыгивает", "срыгнул", "срыгивание", "срыгивания",
      "фонтаном срыгивает", "обильно срыгивает",
    ],
    patterns: [
      /срыгива(ет|ние|ния|ют)/i,
    ],
  },
  {
    topicKey: "food_refusal",
    topicTitle: "Ребёнок не хочет есть — что делать?",
    topicShortTitle: "Ребёнок не ест",
    phraseBank: [
      "плохо ест",
      "не хочет есть",
      "ничего не ест",
      "ничего не хочет есть",
      "отказывается от еды",
      "мало ест",
      "не ест прикорм",
      "не хочет пробовать еду",
    ],
    keywords: [
      "малоежка", "не хочет есть", "отказ от еды", "отказывается от еды",
      "отказывается от прикорма", "не ест", "отказ от прикорма", "ест только пюре",
      "плачет при кормлении", "плачет во время кормления", "кидает еду",
      "не сидит за столом", "отказывается есть", "плохой аппетит у ребёнка",
      "плохо ест", "ничего не ест", "мало ест",
    ],
    patterns: [
      /(ребенок|ребёнок|малыш)\s+(не\s+)?(хочет|ест|отказывается)/i,
      /отказ\s+от\s+(еды|прикорма)/i,
      /не\s+хочет\s+есть/i,
    ],
  },
  {
    topicKey: "routine",
    topicTitle: "График кормления: подходит ли возрасту?",
    topicShortTitle: "Режим кормления",
    phraseBank: [],
    keywords: [
      "режим кормления", "график кормления", "сколько раз кормить", "ночные кормления",
      "приёмы пищи по возрасту", "питание по возрасту", "сколько раз в день кормить",
      "режим питания", "переход на 3 приема", "переход на три приема",
    ],
    patterns: [
      /сколько\s+раз\s+(в\s+день\s+)?кормить/i,
      /ночные\s+кормления/i,
      /режим\s+(кормления|питания)/i,
    ],
  },
  {
    topicKey: "food_diary",
    topicTitle: "Дневник питания: записать и получить совет",
    topicShortTitle: "Дневник питания",
    phraseBank: [],
    keywords: [
      "дневник питания", "что ел ребёнок", "что ел ребенок", "записать кормления",
      "разбор рациона", "анализ рациона",
    ],
    patterns: [
      /дневник\s+питания/i,
      /записать\s+(что\s+ел|кормления)/i,
    ],
  },
  {
    topicKey: "urgent_help",
    topicTitle: "Когда срочно обращаться к врачу?",
    topicShortTitle: "Срочная помощь",
    phraseBank: [],
    keywords: [
      "срочно к врачу", "когда к врачу", "кровь в стуле", "кровь в рвоте",
      "температура и понос", "вызвать скорую", "срочно обращаться",
      "высокая температура", "сильная рвота", "отёк горла", "затруднённое дыхание",
      "ребёнок не просыпается", "очень вялый",
    ],
    patterns: [
      /когда\s+срочно\s+(к\s+врачу|обращаться)/i,
      /кровь\s+в\s+(стуле|рвоте)/i,
      /вызвать\s+скорую/i,
    ],
  },
];

/** Слова-симптомы реакции (аллергия/кожа). */
const REACTION_SYMPTOM_WORDS = [
  "сыпь", "покраснение", "пятна", "высыпало", "зуд", "крапивница", "отек", "отёк",
  "реакция", "аллергия", "высыпания", "краснота", "чешется",
];

/** Слова контекста еды/прикорма (для комбинированного правила allergy). */
const FOOD_CONTEXT_WORDS = [
  "продукт", "еда", "прикорм", "каша", "смесь", "молоко", "творог", "яйцо",
];

/**
 * Комбинированное правило: симптом реакции + контекст еды → тема «Аллергия».
 * Ловит формулировки вроде «после нового продукта появилась сыпь», «сыпь после каши».
 */
function matchAllergyByReactionAndFood(lower: string): AssistantTopicDetectResult | null {
  const hasSymptom = REACTION_SYMPTOM_WORDS.some((w) => lower.includes(w));
  const hasFood = FOOD_CONTEXT_WORDS.some((w) => lower.includes(w));
  if (!hasSymptom || !hasFood) return null;
  const allergyTopic = ASSISTANT_TOPICS.find((t) => t.topicKey === "allergy");
  if (!allergyTopic) return null;
  return {
    matched: true,
    topicKey: allergyTopic.topicKey,
    topicTitle: allergyTopic.topicTitle,
    topicShortTitle: allergyTopic.topicShortTitle,
    matchedTerms: ["reaction+food"],
    matchedBy: "combo",
  };
}

/**
 * Определяет, относится ли запрос к одной из тем вкладки «Помощник».
 * Порядок проверки: 1) normalize text, 2) phrase bank, 3) combo rules, 4) regex patterns, 5) keywords.
 * Возвращает первую совпавшую тему; при сомнении не матчим (fail-open в сторону рецепта).
 */
export function detectAssistantTopic(text: string): AssistantTopicDetectResult {
  const trimmed = (text ?? "").trim();
  if (trimmed.length < 3) return { matched: false };

  const normalized = normalizeText(trimmed);

  // 2) Phrase bank — готовые фразы, сразу определяют тему
  for (const topic of ASSISTANT_TOPICS) {
    if (topic.phraseBank.length > 0) {
      const matchedPhrase = topic.phraseBank.find((phrase) =>
        normalized.includes(normalizeText(phrase))
      );
      if (matchedPhrase != null) {
        return {
          matched: true,
          topicKey: topic.topicKey,
          topicTitle: topic.topicTitle,
          topicShortTitle: topic.topicShortTitle,
          matchedTerms: [matchedPhrase],
          matchedBy: "phrase",
        };
      }
    }
  }

  // 3) Combo rules (симптом + еда → allergy)
  const allergyByCombo = matchAllergyByReactionAndFood(normalized);
  if (allergyByCombo) return allergyByCombo;

  // 4) Regex patterns, 5) keywords
  for (const topic of ASSISTANT_TOPICS) {
    const matchedTerms: string[] = [];

    for (const re of topic.patterns) {
      if (re.test(normalized)) {
        const match = normalized.match(re);
        if (match?.[0]) matchedTerms.push(match[0].trim());
        return {
          matched: true,
          topicKey: topic.topicKey,
          topicTitle: topic.topicTitle,
          topicShortTitle: topic.topicShortTitle,
          matchedTerms: [...new Set(matchedTerms)].slice(0, 10),
          matchedBy: "pattern",
        };
      }
    }

    for (const kw of topic.keywords) {
      if (normalized.includes(kw)) matchedTerms.push(kw);
    }
    if (matchedTerms.length > 0) {
      return {
        matched: true,
        topicKey: topic.topicKey,
        topicTitle: topic.topicTitle,
        topicShortTitle: topic.topicShortTitle,
        matchedTerms: [...new Set(matchedTerms)].slice(0, 10),
        matchedBy: "keyword",
      };
    }
  }

  return { matched: false };
}
