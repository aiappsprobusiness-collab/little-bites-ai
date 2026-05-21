/** Флаг: при онбординге ввели >1 аллергии на Free, сохранили одну — показать upsell на экране плана. */

const KEY_PREFIX = "second_allergy_upsell_pending:";

function key(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

export function markSecondAllergyUpsellPending(userId: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(key(userId), "1");
}

export function hasSecondAllergyUpsellPending(userId: string): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(key(userId)) === "1";
}

export function dismissSecondAllergyUpsellPending(userId: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(key(userId));
}
