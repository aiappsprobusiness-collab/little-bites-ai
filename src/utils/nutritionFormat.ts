/**
 * Форматирование КБЖУ для отображения в UI (одна строка, без чипсов).
 */

export function formatKcal(kcal: number | null | undefined): string {
  if (kcal == null || !Number.isFinite(kcal)) return "";
  const n = Math.round(Number(kcal));
  return `${n} ккал`;
}

export function formatMinutes(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min) || min <= 0) return "";
  const n = Math.round(Number(min));
  return `${n} мин`;
}

/**
 * Короткая строка макросов: "На порцию: Б 35 г · Ж 30 г · У 25 г".
 * Только присутствующие значения.
 */
export function formatMacrosInline(
  protein: number | null | undefined,
  fat: number | null | undefined,
  carbs: number | null | undefined
): string {
  const parts: string[] = [];
  if (protein != null && Number.isFinite(protein)) parts.push(`Б ${Math.round(Number(protein))} г`);
  if (fat != null && Number.isFinite(fat)) parts.push(`Ж ${Math.round(Number(fat))} г`);
  if (carbs != null && Number.isFinite(carbs)) parts.push(`У ${Math.round(Number(carbs))} г`);
  if (parts.length === 0) return "";
  return `На порцию: ${parts.join(" · ")}`;
}

/**
 * Развёрнутая строка для деталки: "Одна порция содержит: белки 35 г, жиры 30 г, углеводы 25 г."
 */
export function formatMacrosSentence(
  protein: number | null | undefined,
  fat: number | null | undefined,
  carbs: number | null | undefined
): string {
  const parts: string[] = [];
  if (protein != null && Number.isFinite(protein)) parts.push(`белки ${Math.round(Number(protein))} г`);
  if (fat != null && Number.isFinite(fat)) parts.push(`жиры ${Math.round(Number(fat))} г`);
  if (carbs != null && Number.isFinite(carbs)) parts.push(`углеводы ${Math.round(Number(carbs))} г`);
  if (parts.length === 0) return "";
  return `Одна порция содержит: ${parts.join(", ")}.`;
}

/**
 * Премиум-строка макросов: "Пищевая ценность на порцию: Белки 4 г · Жиры 2 г · Углеводы 22 г".
 * Только присутствующие значения; разделитель " · ".
 */
export function formatMacrosShort(opt: {
  protein?: number | null;
  fat?: number | null;
  carbs?: number | null;
}): string {
  const parts: string[] = [];
  if (opt.protein != null && Number.isFinite(opt.protein)) parts.push(`Белки ${Math.round(Number(opt.protein))} г`);
  if (opt.fat != null && Number.isFinite(opt.fat)) parts.push(`Жиры ${Math.round(Number(opt.fat))} г`);
  if (opt.carbs != null && Number.isFinite(opt.carbs)) parts.push(`Углеводы ${Math.round(Number(opt.carbs))} г`);
  if (parts.length === 0) return "";
  return `Пищевая ценность на порцию: ${parts.join(" · ")}`;
}
