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

  // Извлекаем количество в скобках "Продукт (2 шт)", "Молоко (100 мл)" до удаления скобок
  const parenQty = cleaned.match(/^(.+?)\s*\((\d+(?:[.,]\d+)?)\s*(шт|г|кг|мл|л|ст\.л\.|ч\.л\.)\)\s*$/i);
  if (parenQty) {
    const productPart = parenQty[1].trim();
    const num = parenQty[2];
    const u = parenQty[3];
    cleaned = `${productPart} — ${num} ${u}`;
  }

  // Удаляем остальные комментарии в скобках (не количество)
  cleaned = cleaned.replace(/\([^()]*\)/g, '').trim();
  cleaned = cleaned.replace(/[()]/g, '').trim();

  // "100 мл продукта", "2 шт яйца" — количество в начале
  const leadingQty = cleaned.match(/^(\d+(?:[.,]\d+)?(?:\s*-\s*\d+(?:[.,]\d+)?)?)\s*(шт|г|кг|мл|л|ст\.л\.|ч\.л\.)\s+(.+)$/i);
  if (leadingQty) {
    const numPart = leadingQty[1].replace(/\s*-\s*/, '-');
    const parts = numPart.includes('-') ? numPart.split('-').map((n) => parseFloat(n.replace(',', '.'))) : [parseFloat(numPart.replace(',', '.'))];
    const quantity = parts.length === 2 ? Math.round((parts[0] + parts[1]) / 2) : parts[0];
    const unit = normalizeUnit(leadingQty[2]);
    const productName = leadingQty[3].trim();
    const name = productName.charAt(0).toUpperCase() + productName.slice(1);
    return { name, quantity, unit };
  }

  // Удаляем описания после тире/дефиса, если они содержат инструкции
  // "Продукт - 100г", "Продукт — 100 г"
  const dashMatch = cleaned.match(/^([^—\-]+?)[—\-]\s*(.+)$/);
  if (dashMatch) {
    const beforeDash = dashMatch[1].trim();
    const afterDash = dashMatch[2].trim();
    const quantityMatch = afterDash.match(/^(\d+(?:[.,]\d+)?(?:\s*-\s*\d+(?:[.,]\d+)?)?)\s*(шт|г|кг|мл|л|ст\.л\.|ч\.л\.|[а-яё]+\.?)/i);
    if (quantityMatch) {
      cleaned = `${beforeDash} ${afterDash}`;
    } else {
      cleaned = beforeDash;
    }
  }

  // Извлекаем количество и единицу измерения (в т.ч. без пробела: "100г", "2шт")
  const quantityPatterns = [
    /(\d+(?:[.,]\d+)?)\s*-\s*(\d+(?:[.,]\d+)?)\s*(шт|г|кг|мл|л|ст\.л\.|ч\.л\.|[а-яё]+\.?)/i,
    /(\d+(?:[.,]\d+)?)\s*(шт|г|кг|мл|л|ст\.л\.|ч\.л\.|[а-яё]+\.?)/i,
    /по\s+вкусу/i,
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
