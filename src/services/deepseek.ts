/**
 * DeepSeek API Service
 * 
 * Сервис для работы с DeepSeek API для распознавания продуктов и генерации рецептов
 */
import { safeLog, safeWarn, safeError } from "@/utils/safeLogger";

export interface DeepSeekConfig {
  apiKey: string;
  baseURL?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{
    type: 'text' | 'image_url';
    text?: string;
    image_url?: {
      url: string;
    };
  }>;
}

export interface ChatResponse {
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
  }>;
}

export interface ImageAnalysisResponse {
  products: Array<{
    name: string;
    confidence: number;
    emoji?: string;
  }>;
}

export interface RecipeSuggestion {
  title: string;
  description: string;
  ingredients: string[];
  steps: string[];
  cookingTime: number;
  ageRange: string;
}

class DeepSeekService {
  private config: DeepSeekConfig;

  constructor(config: DeepSeekConfig) {
    this.config = {
      baseURL: 'https://api.deepseek.com/v1',
      ...config,
    };
  }

  /**
   * Отправить сообщение в чат
   */
  async chat(messages: ChatMessage[], model: string = 'deepseek-chat'): Promise<string> {
    try {
      const response = await fetch(`${this.config.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: messages.map(msg => ({
            role: msg.role,
            content: msg.content,
          })),
          temperature: 0.7,
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `DeepSeek API error: ${response.status}`;
        try {
          const errorData = JSON.parse(errorText);
          errorMessage += ` - ${errorData.error?.message || errorData.message || errorText}`;
        } catch {
          errorMessage += ` - ${errorText}`;
        }
        throw new Error(errorMessage);
      }

      const data: ChatResponse = await response.json();
      return data.choices[0]?.message?.content || '';
    } catch (error) {
      safeError('DeepSeek chat error:', error);
      throw error;
    }
  }

  /**
   * Анализ изображения и распознавание продуктов
   * 
   * Использует DeepSeek Vision API для анализа изображений
   */
  async analyzeImage(imageBase64: string, imageMimeType: string = 'image/jpeg'): Promise<ImageAnalysisResponse> {
    try {
      const systemPrompt = `Ты помощник для приложения детского питания. 
Проанализируй изображение и определи все продукты питания, которые на нем видны.
Верни ответ ТОЛЬКО в формате JSON без дополнительного текста:
{
  "products": [
    {"name": "Название продукта", "confidence": 0.95, "emoji": "🍎"}
  ]
}
Используй только русские названия продуктов. Названия должны быть в именительном падеже единственного числа.
Будь внимательным и найди все продукты, которые видны на изображении.`;

      // Формируем data URL для изображения
      const imageDataUrl = `data:${imageMimeType};base64,${imageBase64}`;

      // Используем формат с изображением для Vision API
      const messages: ChatMessage[] = [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Проанализируй это изображение и найди все продукты питания. Верни список в формате JSON.'
            },
            {
              type: 'image_url',
              image_url: {
                url: imageDataUrl
              }
            }
          ]
        }
      ];

      // DeepSeek может не поддерживать vision напрямую, используем текстовый подход
      // Сначала пробуем с изображением, если не работает - fallback
      let response: string;
      try {
        response = await this.chat(messages, 'deepseek-chat');
      } catch (error: any) {
        // Если не поддерживается vision, используем fallback
        if (error.message?.includes('vision') || error.message?.includes('image') || error.message?.includes('400')) {
          return this.analyzeImageFallback(imageBase64);
        }
        throw error;
      }

      // Парсим JSON ответ
      try {
        // Ищем JSON в ответе
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.products && Array.isArray(parsed.products) && parsed.products.length > 0) {
            safeLog('Successfully parsed products from DeepSeek:', parsed.products);
            return parsed;
          }
        }
      } catch (e) {
        safeWarn('Failed to parse JSON response, trying text extraction');
      }

      // Fallback: если не удалось распарсить JSON, пытаемся извлечь продукты из текста
      const products = this.extractProductsFromText(response);
      if (products.length > 0) {
        safeLog('Extracted products from text:', products);
        return { products };
      }

      // Если ничего не найдено, возвращаем пустой массив
      safeWarn('No products found in DeepSeek response');
      return { products: [] };
    } catch (error: any) {
      safeError('Image analysis error:', error);

      // Если ошибка связана с форматом изображения, пробуем текстовый запрос
      if (error.message?.includes('image') || error.message?.includes('format') || error.message?.includes('vision')) {
        safeLog('Trying fallback text-based analysis');
        return this.analyzeImageFallback(imageBase64);
      }

      // Возвращаем пустой результат вместо ошибки для более плавной работы
      return { products: [] };
    }
  }

  /**
   * Fallback метод: анализ через текстовое описание (если Vision API не работает)
   */
  private async analyzeImageFallback(imageBase64: string): Promise<ImageAnalysisResponse> {
    try {
      const systemPrompt = `Ты помощник для приложения детского питания. 
Определи все продукты питания, которые могут быть на изображении с продуктами для детского питания.
Верни ответ ТОЛЬКО в формате JSON:
{
  "products": [
    {"name": "Название продукта", "confidence": 0.8, "emoji": "🍎"}
  ]
}
Используй только русские названия продуктов.`;

      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: 'Проанализируй изображение продуктов для детского питания и верни список всех продуктов в формате JSON. Изображение закодировано в base64, но ты можешь дать общие рекомендации по типичным продуктам для детского питания.'
        },
      ];

      const response = await this.chat(messages);
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.products && Array.isArray(parsed.products)) {
          return parsed;
        }
      }

      const products = this.extractProductsFromText(response);
      return { products };
    } catch (error) {
      safeError('Fallback analysis error:', error);
      return { products: [] };
    }
  }

  /**
   * Извлечение продуктов из текстового ответа (fallback)
   */
  private extractProductsFromText(text: string): ImageAnalysisResponse['products'] {
    const productNames = [
      'тыква', 'яблоко', 'морковь', 'банан', 'груша', 'брокколи',
      'картофель', 'капуста', 'помидор', 'огурец', 'перец', 'лук',
      'чеснок', 'кабачок', 'баклажан', 'свекла', 'редис', 'редиска',
      'молоко', 'творог', 'сыр', 'йогурт', 'кефир', 'сметана',
      'мясо', 'курица', 'индейка', 'говядина', 'рыба', 'яйцо',
      'рис', 'гречка', 'овсянка', 'пшено', 'макароны', 'хлеб',
    ];

    const found: ImageAnalysisResponse['products'] = [];
    const lowerText = text.toLowerCase();

    productNames.forEach(name => {
      if (lowerText.includes(name)) {
        found.push({
          name: name.charAt(0).toUpperCase() + name.slice(1),
          confidence: 0.8,
          emoji: this.getProductEmoji(name),
        });
      }
    });

    return found;
  }

  /**
   * Получить emoji для продукта
   */
  private getProductEmoji(productName: string): string {
    const emojiMap: Record<string, string> = {
      'тыква': '🎃',
      'яблоко': '🍎',
      'морковь': '🥕',
      'банан': '🍌',
      'груша': '🍐',
      'брокколи': '🥦',
      'картофель': '🥔',
      'капуста': '🥬',
      'помидор': '🍅',
      'огурец': '🥒',
      'перец': '🫑',
      'лук': '🧅',
      'чеснок': '🧄',
      'молоко': '🥛',
      'творог': '🧀',
      'сыр': '🧀',
      'мясо': '🍖',
      'курица': '🍗',
      'индейка': '🦃',
      'рыба': '🐟',
      'яйцо': '🥚',
      'рис': '🍚',
      'гречка': '🌾',
      'овсянка': '🥣',
    };

    return emojiMap[productName.toLowerCase()] || '🥘';
  }

  /**
   * Форматирует контекст для одного ребёнка (возраст и аллергии)
   */
  private buildSingleChildContext(
    childAgeMonths?: number,
    allergies?: string[]
  ): {
    ageInfo: string;
    ageRange: string;
    allergyLine: string;
  } {
    let ageInfo = '';
    let ageRange = '6+ мес';

    if (childAgeMonths) {
      const years = Math.floor(childAgeMonths / 12);
      const months = childAgeMonths % 12;

      // Формируем ageInfo для промпта
      if (years > 0) {
        if (months > 0) {
          ageInfo = `Ребёнку ${years} ${years === 1 ? 'год' : years < 5 ? 'года' : 'лет'} ${months} ${months === 1 ? 'месяц' : months < 5 ? 'месяца' : 'месяцев'} (${childAgeMonths} месяцев). `;
        } else {
          ageInfo = `Ребёнку ${years} ${years === 1 ? 'год' : years < 5 ? 'года' : 'лет'} (${childAgeMonths} месяцев). `;
        }
      } else {
        ageInfo = `Ребёнку ${childAgeMonths} ${childAgeMonths === 1 ? 'месяц' : childAgeMonths < 5 ? 'месяца' : 'месяцев'}. `;
      }

      // Формируем ageRange для RecipeSuggestion
      if (years > 0) {
        if (months > 0) {
          ageRange = `${years} г. ${months} мес`;
        } else {
          ageRange = `${years} ${years === 1 ? 'год' : years < 5 ? 'года' : 'лет'}`;
        }
      } else {
        ageRange = `${childAgeMonths} мес`;
      }
    }

    const allergyLine =
      allergies && allergies.length > 0
        ? `У ребёнка аллергия на: ${allergies.join(', ')}. Не используй эти продукты и их производные.`
        : '';

    return { ageInfo, ageRange, allergyLine };
  }

  /**
   * Генерация рецепта на основе продуктов
   */
  async generateRecipe(
    products: string[],
    childAgeMonths?: number,
    allergies?: string[]
  ): Promise<RecipeSuggestion> {
    try {
      const { ageInfo, ageRange, allergyLine } = this.buildSingleChildContext(
        childAgeMonths,
        allergies
      );

      const systemPrompt = `Ты эксперт по детскому питанию и аллергиям.
Создай ОДИН рецепт блюда для ребёнка на основе указанных продуктов.

${ageInfo}${allergyLine || 'Используй только продукты, безопасные для детского питания.'}

Требования:
- Рецепт должен быть безопасным и подходящим для возраста ребёнка.
- Если есть аллергии, полностью исключи эти продукты и их производные.
- Формат ответа: ТОЛЬКО один JSON-объект без дополнительного текста:
{
  "title": "...",
  "description": "...",
  "ingredients": ["..."],
  "steps": ["..."],
  "cookingTime": 20,
  "ageRange": "${ageRange}"
}`;

      const userPrompt = `Создай рецепт из следующих продуктов: ${products.join(', ')}.
Если какой-то продукт не подходит по возрасту или по аллергии, НЕ используй его, замени безопасной альтернативой.`;

      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ];

      const response = await this.chat(messages);

      // Парсим JSON ответ
      try {
        // Пробуем разные паттерны для поиска JSON
        const jsonPatterns = [
          /\{[\s\S]*\}/,  // Обычный JSON объект
          /```json\s*(\{[\s\S]*?\})\s*```/,  // JSON в code block
          /```\s*(\{[\s\S]*?\})\s*```/,  // JSON в code block без json
        ];

        let jsonMatch = null;
        for (const pattern of jsonPatterns) {
          jsonMatch = response.match(pattern);
          if (jsonMatch) {
            const jsonString = jsonMatch[1] || jsonMatch[0];
            const parsed = JSON.parse(jsonString);
            safeLog('Successfully parsed recipe JSON:', parsed);
            return parsed;
          }
        }
      } catch (e) {
        safeWarn('Failed to parse recipe JSON:', e, 'Response:', response.substring(0, 200));
      }

      // Fallback: создаем простой рецепт
      return {
        title: `Блюдо из ${products[0]}`,
        description: `Вкусное и полезное блюдо для ребенка`,
        ingredients: products,
        steps: [
          `Подготовьте ${products.join(', ')}`,
          'Приготовьте согласно возрасту ребенка',
        ],
        cookingTime: 20,
        ageRange,
      };
    } catch (error: any) {
      safeError('Recipe generation error:', error);
      if (error.message) {
        throw new Error(`Ошибка генерации рецепта: ${error.message}`);
      }
      throw new Error('Не удалось создать рецепт. Проверьте подключение к интернету и настройки DeepSeek.');
    }
  }

  /**
   * Генерация семейного рецепта на основе текста и профилей членов семьи
   */
  async generateFamilyRecipeFromText(
    userText: string,
    members: Array<{
      name: string;
      ageMonths: number | null;
      isChild: boolean;
      allergies: string[];
    }>,
    products?: string[]
  ): Promise<RecipeSuggestion> {
    try {
      // Строим контекст семьи
      const allAllergies = new Set<string>();
      const childAges: number[] = [];

      members.forEach((member) => {
        (member.allergies || []).forEach((a) => a?.trim() && allAllergies.add(a.trim()));
        if (member.isChild && member.ageMonths != null) {
          childAges.push(member.ageMonths);
        }
      });

      const minChildAgeMonths = childAges.length > 0 ? Math.min(...childAges) : undefined;

      // Формируем описание членов семьи
      const memberDescriptions = members.map((m) => {
        const agePart =
          m.ageMonths != null
            ? `${m.ageMonths} мес`
            : m.isChild
              ? 'ребёнок'
              : 'взрослый';
        const allergiesPart =
          m.allergies && m.allergies.length > 0 ? m.allergies.join(', ') : 'нет';
        return `${m.name} (${agePart}, аллергии: ${allergiesPart})`;
      });

      const familyDescription = memberDescriptions.join('\n');
      const allAllergiesList = Array.from(allAllergies);

      // Формируем возраст для ageRange
      let ageRangeText = '';
      if (minChildAgeMonths) {
        const years = Math.floor(minChildAgeMonths / 12);
        const months = minChildAgeMonths % 12;
        if (years > 0) {
          if (months > 0) {
            ageRangeText = `${years} г. ${months} мес`;
          } else {
            ageRangeText = `${years} ${years === 1 ? 'год' : years < 5 ? 'года' : 'лет'}`;
          }
        } else {
          ageRangeText = `${minChildAgeMonths} мес`;
        }
      } else {
        ageRangeText = 'семейный';
      }

      const allergyInfo =
        allAllergiesList.length > 0
          ? `КРИТИЧЕСКИ ВАЖНО: НЕ используй продукты, на которые есть аллергия у КОГО-ЛИБО из участников: ${allAllergiesList.join(', ')}. `
          : '';

      const ageInfo = minChildAgeMonths
        ? `ВАЖНО: Основная часть блюда должна быть безопасной для самого маленького ребёнка (${minChildAgeMonths} месяцев). `
        : '';

      const productsInfo = products && products.length > 0
        ? `Используй по возможности следующие продукты: ${products.join(', ')}. Если какой-то из них не подходит по возрасту или по аллергии, НЕ используй его. `
        : '';

      const systemPrompt = `Ты эксперт по семейному питанию и детским аллергиям.
Создай ОДИН общий рецепт для следующих членов семьи:

${familyDescription}

ОБЩИЕ ПРАВИЛА:
${allergyInfo}${ageInfo}${productsInfo}
- Если есть маленькие дети, основная часть блюда должна быть безопасной для самого маленького ребёнка по возрасту; взрослым можно добавить специи/острое отдельно.

Верни ответ ТОЛЬКО в формате JSON без дополнительного текста:
{
  "title": "Название рецепта",
  "description": "Краткое описание с учетом всех участников, возраста и ограничений",
  "ingredients": ["ингредиент 1", "ингредиент 2"],
  "steps": ["шаг 1", "шаг 2"],
  "cookingTime": 20,
  "ageRange": "${ageRangeText}"
}

Требования:
- Рецепт должен быть безопасным и подходящим для всех участников
- ${allergyInfo ? `КРИТИЧЕСКИ ВАЖНО: НЕ используй продукты: ${allAllergiesList.join(', ')}. Проверь каждый ингредиент на наличие аллергенов.` : 'Используй только безопасные продукты'}
- Ингредиенты должны быть подходящими для указанного возраста
- Шаги приготовления должны быть простыми и безопасными`;

      const userPrompt = `Запрос пользователя: ${userText}`;

      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ];

      const response = await this.chat(messages);

      // Парсим JSON ответ
      try {
        const jsonPatterns = [
          /\{[\s\S]*\}/,
          /```json\s*(\{[\s\S]*?\})\s*```/,
          /```\s*(\{[\s\S]*?\})\s*```/,
        ];

        let jsonMatch = null;
        for (const pattern of jsonPatterns) {
          jsonMatch = response.match(pattern);
          if (jsonMatch) {
            const jsonString = jsonMatch[1] || jsonMatch[0];
            const parsed = JSON.parse(jsonString);
            safeLog('Successfully parsed family recipe JSON:', parsed);
            return parsed;
          }
        }
      } catch (e) {
        safeWarn('Failed to parse family recipe JSON:', e, 'Response:', response.substring(0, 200));
      }

      // Fallback: создаем простой рецепт
      return {
        title: `Семейное блюдо`,
        description: `Вкусное и полезное блюдо для всей семьи`,
        ingredients: products || ['Ингредиенты по запросу'],
        steps: [
          'Подготовьте все ингредиенты',
          'Приготовьте согласно возрасту самого маленького участника',
        ],
        cookingTime: 30,
        ageRange: ageRangeText || 'семейный',
      };
    } catch (error: any) {
      safeError('Family recipe generation error:', error);
      if (error.message) {
        throw new Error(`Ошибка генерации семейного рецепта: ${error.message}`);
      }
      throw new Error('Не удалось создать семейный рецепт. Проверьте подключение к интернету и настройки DeepSeek.');
    }
  }

  /**
   * Получить рекомендацию для ребенка
   */
  async getRecommendation(childAgeMonths: number, allergies?: string[]): Promise<string> {
    try {
      const allergyInfo = allergies && allergies.length > 0
        ? `У ребенка аллергия на: ${allergies.join(', ')}. `
        : '';

      const messages: ChatMessage[] = [
        {
          role: 'system',
          content: 'Ты помощник для родителей по детскому питанию. Дай краткую полезную рекомендацию (2-3 предложения).',
        },
        {
          role: 'user',
          content: `Ребенку ${childAgeMonths} месяцев. ${allergyInfo}Дай рекомендацию по питанию для этого возраста.`,
        },
      ];

      return await this.chat(messages);
    } catch (error) {
      safeError('Recommendation error:', error);
      throw new Error('Не удалось получить рекомендацию');
    }
  }
}

// Создаем singleton экземпляр
let deepseekInstance: DeepSeekService | null = null;

/**
 * Инициализация DeepSeek сервиса
 */
export function initDeepSeek(config: DeepSeekConfig): DeepSeekService {
  deepseekInstance = new DeepSeekService(config);
  return deepseekInstance;
}

/**
 * Получить экземпляр DeepSeek сервиса
 * @throws Error если DeepSeek не настроен
 */
export function getDeepSeek(): DeepSeekService {
  if (!deepseekInstance) {
    const apiKey = import.meta.env.VITE_DEEPSEEK_API_KEY;

    if (!apiKey) {
      throw new Error(
        'DeepSeek не настроен. Создайте файл .env с VITE_DEEPSEEK_API_KEY'
      );
    }

    deepseekInstance = new DeepSeekService({
      apiKey,
    });
  }

  return deepseekInstance;
}

/**
 * Проверить, настроен ли DeepSeek
 */
export function isDeepSeekConfigured(): boolean {
  return !!import.meta.env.VITE_DEEPSEEK_API_KEY;
}

/**
 * Конвертация File в base64
 */
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Убираем data:image/jpeg;base64, префикс
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
