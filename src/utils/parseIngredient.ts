/**
 * Парсинг ингредиента из сырой строки рецепта.
 * Извлекает чистое название продукта, количество и единицу измерения.
 * Удаляет все комментарии, описания и пояснения в скобках.
 */

/** Проверяет, похожа ли строка на шаг приготовления (инструкцию), а не на продукт для покупки. */
export function looksLikeInstruction(name: string | null | undefined): boolean {
  if (!name || name.length >= 60) return true;
  const lower = name.toLowerCase();
  const phrases = ["перед подачей", "по вкусу", "по желанию", "для подачи", "при подаче", "каждый кусочек", "каждый кусок"];
  const verbs = ["посыпать", "полить", "смазать", "нарезать", "варить", "обжарить", "добавить", "смешать", "залить", "положить", "тушить", "запечь", "выложить", "обвалять", "обваливать", "обмакнуть", "обмакивать", "запанировать"];
  return phrases.some((p) => lower.includes(p)) || verbs.some((v) => lower.includes(v));
}

export interface ParsedIngredient {
  name: string;
  quantity: number | null;
  unit: string | null;
}

/**
 * Парсит строку ингредиента, извлекая название, количество и единицу измерения.
 * Удаляет все комментарии, описания в скобках и пояснения.
 */
export function parseIngredient(raw: string): ParsedIngredient {
  if (!raw || typeof raw !== 'string') {
    return { name: '', quantity: null, unit: null };
  }

  let cleaned = raw.trim();

  // Удаляем комментарии в скобках (включая вложенные)
  cleaned = cleaned.replace(/\([^()]*\)/g, '').trim();
  // Удаляем оставшиеся скобки
  cleaned = cleaned.replace(/[()]/g, '').trim();

  // Удаляем описания после тире/дефиса, если они содержат инструкции
  // Паттерн: "Продукт - количество (описание)" или "Продукт — количество"
  const dashMatch = cleaned.match(/^([^—\-]+?)[—\-]\s*(.+)$/);
  if (dashMatch) {
    const beforeDash = dashMatch[1].trim();
    const afterDash = dashMatch[2].trim();

    // Если после тире есть число + единица, это количество
    // Важно: конкретные единицы (мл, л, ст.л., ч.л.) идут перед общим паттерном [а-яё]+
    const quantityMatch = afterDash.match(/^(\d+(?:[.,]\d+)?(?:\s*-\s*\d+(?:[.,]\d+)?)?)\s*(шт|г|кг|мл|л|ст\.л\.|ч\.л\.|[а-яё]+\.?)/i);
    if (quantityMatch) {
      cleaned = `${beforeDash} ${afterDash}`;
    } else {
      // Если после тире нет количества, оставляем только до тире
      cleaned = beforeDash;
    }
  }

  // Извлекаем количество и единицу измерения
  // Паттерны: "6-8 шт", "1 шт", "100 г", "2 ст.л.", "по вкусу"
  // Важно: конкретные единицы (мл, л, ст.л., ч.л.) идут перед общим паттерном [а-яё]+
  const quantityPatterns = [
    /(\d+(?:[.,]\d+)?)\s*-\s*(\d+(?:[.,]\d+)?)\s*(шт|г|кг|мл|л|ст\.л\.|ч\.л\.|[а-яё]+\.?)/i, // "6-8 шт"
    /(\d+(?:[.,]\d+)?)\s*(шт|г|кг|мл|л|ст\.л\.|ч\.л\.|[а-яё]+\.?)/i, // "1 шт", "100 г"
    /по\s+вкусу/i, // "по вкусу"
  ];

  let quantity: number | null = null;
  let unit: string | null = null;
  let name = cleaned;

  for (const pattern of quantityPatterns) {
    const match = cleaned.match(pattern);
    if (match) {
      if (match[0].toLowerCase().includes('по вкусу')) {
        // "по вкусу" - без количества
        name = cleaned.replace(/по\s+вкусу/gi, '').trim();
        quantity = null;
        unit = null;
        break;
      } else if (match[1] && match[2] && match[3]) {
        // Диапазон "6-8 шт" - берем среднее или первое значение
        const first = parseFloat(match[1].replace(',', '.'));
        const second = parseFloat(match[2].replace(',', '.'));
        quantity = Math.round((first + second) / 2);
        unit = normalizeUnit(match[3]);
        name = cleaned.replace(pattern, '').trim();
        break;
      } else if (match[1] && match[2]) {
        // Обычное количество "1 шт"
        quantity = parseFloat(match[1].replace(',', '.'));
        unit = normalizeUnit(match[2]);
        name = cleaned.replace(pattern, '').trim();
        break;
      }
    }
  }

  // Очищаем название от лишних символов
  name = name
    .replace(/^[—\-]\s*/, '') // Убираем тире в начале
    .replace(/\s*[—\-]\s*$/, '') // Убираем тире в конце
    .replace(/\s+/g, ' ') // Множественные пробелы в один
    .trim();

  // Убираем лишние символы в конце: пробел и точка, пробел и цифра (например "Помидоры .", "Лук 1/.")
  name = name
    .replace(/\s+\.\s*$/, '') // пробел и точка в конце
    .replace(/\s+\d[\d/.]*$/, '') // пробел и цифра (и слэш/точка) в конце
    .trim();

  // Если название пустое, возвращаем исходную строку без парсинга
  if (!name) {
    return { name: raw.trim(), quantity: null, unit: null };
  }

  // Капитализируем первую букву
  name = name.charAt(0).toUpperCase() + name.slice(1);

  return { name, quantity, unit };
}

/**
 * Убирает лишние символы в конце названия продукта (пробел+точка, пробел+цифра).
 * Использовать при отображении названий из БД.
 */
export function cleanProductNameDisplay(name: string): string {
  if (!name || typeof name !== 'string') return name;
  return name
    .replace(/\s+\.\s*$/, '')
    .replace(/\s+\d[\d/.]*$/, '')
    .trim();
}

/**
 * Нормализует единицу измерения к стандартному виду
 */
function normalizeUnit(unit: string): string {
  const u = unit.toLowerCase().trim();

  // Штуки
  if (u.includes('шт') || u.includes('штук')) return 'шт';

  // Вес
  if (u.includes('кг') || u.includes('килограмм')) return 'кг';
  if (u.includes('г') || u.includes('грамм')) return 'г';

  // Объем: проверяем мл ПЕРЕД л, иначе "мл" матчится на "л"
  if (u.includes('мл') || u.includes('миллилитр')) return 'мл';
  if (u === 'л' || u.includes('литр')) return 'л';

  // Столовые/чайные ложки
  if (u.includes('ст.л') || u.includes('столовая')) return 'ст.л.';
  if (u.includes('ч.л') || u.includes('чайная')) return 'ч.л.';

  return u;
}

/**
 * Извлекает из текста строки, похожие на ингредиенты (с тире или цифрами).
 * Разбивает по переносам строк и запятым, возвращает отфильтрованные непустые строки.
 */
export function parseIngredients(text: string): string[] {
  if (!text || typeof text !== 'string') return [];
  const lines = text
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return lines.filter((line) => {
    const hasDash = /[—\-]/.test(line);
    const hasDigit = /\d/.test(line);
    return hasDash || hasDigit;
  });
}
