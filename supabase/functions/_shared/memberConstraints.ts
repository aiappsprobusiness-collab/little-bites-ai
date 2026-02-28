/**
 * Builds prompt constraint blocks from family constraints.
 * Used by deepseek-chat to inject allergies/dislikes/preferences without age rules.
 */

import type { FamilyConstraints } from "./familyMode.ts";

/** Family-mode prompt line: universal recipe, no age/child mention. */
export function getFamilyContextPromptLine(): string {
  return "Готовим для общего стола. Учитываются аллергии и «не любят» всех членов семьи. Рецепт универсальный, без упоминания возраста и прикорма.";
}

/** Fallback when no members: neutral family line. */
export function getFamilyContextPromptLineEmpty(): string {
  return "Готовим для семьи. Рецепт универсальный.";
}

/**
 * Formats allergies from FamilyConstraints for template (e.g. {{allergies}}).
 */
export function formatAllergiesLine(constraints: FamilyConstraints): string {
  return constraints.allergies.length > 0 ? constraints.allergies.join(", ") : "не указано";
}

/**
 * Formats preferences/likes from FamilyConstraints for template.
 */
export function formatPreferencesLine(constraints: FamilyConstraints): string {
  const combined = [...new Set([...constraints.preferences, ...constraints.likes])].filter(Boolean);
  return combined.length > 0 ? combined.join(", ") : "не указано";
}
