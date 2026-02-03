/**
 * v2: age-based logic — категория возраста и правила питания для prompt-builder.
 * Явные правила в коде (не только в тексте промпта).
 */

export type AgeCategory = "infant" | "toddler" | "school" | "adult";

/** Возвращает категорию возраста по количеству месяцев. */
export function getAgeCategory(ageMonths: number): AgeCategory {
  if (ageMonths <= 12) return "infant";
  if (ageMonths <= 60) return "toddler";
  if (ageMonths <= 216) return "school";
  return "adult";
}

/** Правила питания по категории — строки для system/user prompt (добавляются в prompt-builder). */
export function getAgeCategoryRules(category: AgeCategory): string {
  switch (category) {
    case "infant":
      return [
        "Только прикорм и пюре.",
        "Без соли, сахара, мёда, цельного молока.",
        "Мягкие текстуры, без аллергенов по списку.",
      ].join(" ");
    case "toddler":
      return [
        "Мягкая пища, минимум соли.",
        "Без зажарки, без острых специй, маленькие порции.",
      ].join(" ");
    case "school":
      return [
        "Полноценное питание, увеличенные порции, умеренные специи.",
      ].join(" ");
    case "adult":
      return [
        "Полноценное взрослое меню, без ограничений по текстуре и специям.",
      ].join(" ");
    default:
      return "";
  }
}
