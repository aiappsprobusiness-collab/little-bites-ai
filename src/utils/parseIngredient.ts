/**
 * Парсинг ингредиента из сырой строки рецепта.
 * Извлекает чистое название продукта, количество и единицу измерения.
 * Удаляет все комментарии, описания и пояснения в скобках.
 */

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
    const quantityMatch = afterDash.match(/^(\d+(?:[.,]\d+)?(?:\s*-\s*\d+(?:[.,]\d+)?)?)\s*([а-яё]+\.?|шт|г|кг|мл|л|ст\.л\.|ч\.л\.)/i);
    if (quantityMatch) {
      cleaned = `${beforeDash} ${afterDash}`;
    } else {
      // Если после тире нет количества, оставляем только до тире
      cleaned = beforeDash;
    }
  }

  // Извлекаем количество и единицу измерения
  // Паттерны: "6-8 шт", "1 шт", "100 г", "2 ст.л.", "по вкусу"
  const quantityPatterns = [
    /(\d+(?:[.,]\d+)?)\s*-\s*(\d+(?:[.,]\d+)?)\s*([а-яё]+\.?|шт|г|кг|мл|л|ст\.л\.|ч\.л\.)/i, // "6-8 шт"
    /(\d+(?:[.,]\d+)?)\s*([а-яё]+\.?|шт|г|кг|мл|л|ст\.л\.|ч\.л\.)/i, // "1 шт", "100 г"
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

  // Если название пустое, возвращаем исходную строку без парсинга
  if (!name) {
    return { name: raw.trim(), quantity: null, unit: null };
  }

  // Капитализируем первую букву
  name = name.charAt(0).toUpperCase() + name.slice(1);

  return { name, quantity, unit };
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
  
  // Объем
  if (u.includes('л') || u.includes('литр')) return 'л';
  if (u.includes('мл') || u.includes('миллилитр')) return 'мл';
  
  // Столовые/чайные ложки
  if (u.includes('ст.л') || u.includes('столовая')) return 'ст.л.';
  if (u.includes('ч.л') || u.includes('чайная')) return 'ч.л.';
  
  return u;
}
