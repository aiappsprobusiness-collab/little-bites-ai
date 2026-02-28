/**
 * Определение mealType из текста запроса пользователя.
 * Если пользователь явно указал блюдо — mealType выводим из запроса, а не из UI.
 */

export type MealType = "breakfast" | "lunch" | "snack" | "dinner";

const BREAKFAST_PATTERNS = [
  /\b(каш[аеу]|овсянк|гречк|рисовая\s+каша|кукурузная\s+каша|манн?ая|пшённ?ая)\b/i,
  /\b(омлет|яичниц|яйц[оа])\b/i,
  /\b(сырник|творожник|запеканк[аеи])\b/i,
  /\b(блинчик|блин\b|оладь)\b/i,
  /\b(тост|гренк|бутерброд)\b/i,
  /\b(мюсли|гранол)\b/i,
  /\b(творог\s+с\b|йогурт\s+на\s+завтрак)\b/i,
  /\bзавтрак\b/i,
];

const LUNCH_PATTERNS = [
  /\b(суп|борщ|щи|солянк|рассольник|окрошк|гаспачо)\b/i,
  /\b(обед)\b/i,
];

const DINNER_PATTERNS = [
  /\b(котлет|тефтел|рагу|плов|гарнир|мясо\s+с\b|рыба\s+с\b|куриц\w*\s+с\b)\b/i,
  /\b(ужин)\b/i,
];

const SNACK_PATTERNS = [
  /\b(смузи|йогурт|кефир|творожок|печенье|фрукт|перекус|полдник)\b/i,
];

/**
 * Возвращает true, если в тексте явно указано конкретное блюдо или тип блюда
 * (каша, омлет, суп и т.д.), а не общий запрос вроде «что приготовить».
 */
export function isExplicitDishRequest(text: string): boolean {
  const t = (text ?? "").trim();
  if (t.length < 2) return false;
  const patterns = [
    ...BREAKFAST_PATTERNS,
    ...LUNCH_PATTERNS,
    ...DINNER_PATTERNS,
    ...SNACK_PATTERNS,
  ];
  return patterns.some((re) => re.test(t));
}

/**
 * Определяет mealType из запроса пользователя по ключевым словам.
 * Приоритет: завтрак → обед → ужин → перекус; внутри — по первому совпадению типа блюда.
 */
export function inferMealTypeFromQuery(text: string): MealType | null {
  const t = (text ?? "").trim();
  if (!t) return null;

  if (BREAKFAST_PATTERNS.some((re) => re.test(t))) return "breakfast";
  if (LUNCH_PATTERNS.some((re) => re.test(t))) return "lunch";
  if (DINNER_PATTERNS.some((re) => re.test(t))) return "dinner";
  if (SNACK_PATTERNS.some((re) => re.test(t))) return "snack";

  return null;
}
