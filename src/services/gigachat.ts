/**
 * GigaChat API Service
 * 
 * ВАЖНО: Для продакшена рекомендуется использовать backend proxy
 * для защиты API ключей. Этот сервис предназначен для разработки.
 */

export interface GigaChatConfig {
  clientSecretKey: string; // Base64 encoded key
  isPersonal?: boolean;
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

class GigaChatService {
  private config: GigaChatConfig;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(config: GigaChatConfig) {
    this.config = {
      isPersonal: true,
      baseURL: 'https://gigachat.devices.sberbank.ru/api/v1',
      ...config,
    };
  }

  /**
   * Получить токен доступа
   */
  private async getAccessToken(): Promise<string> {
    // Если токен еще действителен, возвращаем его
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    try {
      const response = await fetch(`${this.config.baseURL}/oauth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${this.config.clientSecretKey}`,
          'RqUID': this.generateRqUID(),
          'Accept': 'application/json',
        },
        body: new URLSearchParams({
          scope: 'GIGACHAT_API_PERS',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `Ошибка получения токена: ${response.status} ${response.statusText}`;
        try {
          const errorData = JSON.parse(errorText);
          errorMessage += ` - ${errorData.message || errorData.error || errorText}`;
        } catch {
          errorMessage += ` - ${errorText}`;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      this.accessToken = data.access_token;
      // Токен обычно действителен 30 минут, устанавливаем 25 минут для безопасности
      this.tokenExpiresAt = Date.now() + (data.expires_in - 300) * 1000;

      return this.accessToken;
    } catch (error: any) {
      console.error('GigaChat token error:', error);
      // Более детальное сообщение об ошибке
      if (error.message) {
        throw error; // Пробрасываем уже обработанную ошибку
      }
      throw new Error('Не удалось получить токен доступа GigaChat. Проверьте API ключ в .env файле.');
    }
  }

  /**
   * Генерация уникального RqUID
   */
  private generateRqUID(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Отправить сообщение в чат
   */
  async chat(messages: ChatMessage[], model: string = 'GigaChat'): Promise<string> {
    try {
      const token = await this.getAccessToken();

      const response = await fetch(`${this.config.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: messages.map(msg => ({
            role: msg.role,
            content: msg.content, // Может быть строкой или массивом для изображений
          })),
          temperature: 0.7,
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `GigaChat API error: ${response.status}`;
        try {
          const errorData = JSON.parse(errorText);
          errorMessage += ` - ${errorData.message || errorData.error || errorText}`;
        } catch {
          errorMessage += ` - ${errorText}`;
        }
        throw new Error(errorMessage);
      }

      const data: ChatResponse = await response.json();
      return data.choices[0]?.message?.content || '';
    } catch (error) {
      console.error('GigaChat chat error:', error);
      throw error;
    }
  }

  /**
   * Анализ изображения и распознавание продуктов
   * 
   * Использует GigaChat Vision API для анализа изображений
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

      const response = await this.chat(messages);
      
      // Парсим JSON ответ
      try {
        // Ищем JSON в ответе
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.products && Array.isArray(parsed.products) && parsed.products.length > 0) {
            console.log('Successfully parsed products from GigaChat:', parsed.products);
            return parsed;
          }
        }
      } catch (e) {
        console.warn('Failed to parse JSON response, trying text extraction');
      }

      // Fallback: если не удалось распарсить JSON, пытаемся извлечь продукты из текста
      const products = this.extractProductsFromText(response);
      if (products.length > 0) {
        console.log('Extracted products from text:', products);
        return { products };
      }

      // Если ничего не найдено, возвращаем пустой массив
      console.warn('No products found in GigaChat response');
      return { products: [] };
    } catch (error: any) {
      console.error('Image analysis error:', error);
      
      // Если ошибка связана с форматом изображения, пробуем текстовый запрос
      if (error.message?.includes('image') || error.message?.includes('format')) {
        console.log('Trying fallback text-based analysis');
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
      console.error('Fallback analysis error:', error);
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
   * Генерация рецепта на основе продуктов
   */
  async generateRecipe(
    products: string[],
    childAgeMonths?: number,
    allergies?: string[]
  ): Promise<RecipeSuggestion> {
    try {
      const ageInfo = childAgeMonths
        ? `Ребенку ${childAgeMonths} месяцев. `
        : '';
      const allergyInfo = allergies && allergies.length > 0
        ? `У ребенка аллергия на: ${allergies.join(', ')}. `
        : '';

      const systemPrompt = `Ты эксперт по детскому питанию. Создай рецепт блюда для ребенка на основе указанных продуктов.
${ageInfo}${allergyInfo}
Верни ответ в формате JSON:
{
  "title": "Название рецепта",
  "description": "Краткое описание",
  "ingredients": ["ингредиент 1", "ингредиент 2"],
  "steps": ["шаг 1", "шаг 2"],
  "cookingTime": 20,
  "ageRange": "6+ мес"
}
Учти возраст ребенка и аллергии. Рецепт должен быть безопасным и полезным.`;

      const userPrompt = `Создай рецепт из следующих продуктов: ${products.join(', ')}`;

      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ];

      const response = await this.chat(messages);

      // Парсим JSON ответ
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        console.warn('Failed to parse recipe JSON, using fallback');
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
        ageRange: childAgeMonths ? `${childAgeMonths}+ мес` : '6+ мес',
      };
    } catch (error: any) {
      console.error('Recipe generation error:', error);
      // Более детальное сообщение об ошибке
      if (error.message) {
        throw new Error(`Ошибка генерации рецепта: ${error.message}`);
      }
      throw new Error('Не удалось создать рецепт. Проверьте подключение к интернету и настройки GigaChat.');
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
      console.error('Recommendation error:', error);
      throw new Error('Не удалось получить рекомендацию');
    }
  }
}

// Создаем singleton экземпляр
let gigachatInstance: GigaChatService | null = null;

/**
 * Инициализация GigaChat сервиса
 */
export function initGigaChat(config: GigaChatConfig): GigaChatService {
  gigachatInstance = new GigaChatService(config);
  return gigachatInstance;
}

/**
 * Получить экземпляр GigaChat сервиса
 * @throws Error если GigaChat не настроен
 */
export function getGigaChat(): GigaChatService {
  if (!gigachatInstance) {
    const clientSecretKey = import.meta.env.VITE_GIGACHAT_CLIENT_SECRET_KEY;
    
    if (!clientSecretKey) {
      throw new Error(
        'GigaChat не настроен. Создайте файл .env с VITE_GIGACHAT_CLIENT_SECRET_KEY. См. GIGACHAT_SETUP.md'
      );
    }

    gigachatInstance = new GigaChatService({
      clientSecretKey,
      isPersonal: import.meta.env.VITE_GIGACHAT_IS_PERSONAL !== 'false',
    });
  }

  return gigachatInstance;
}

/**
 * Проверить, настроен ли GigaChat
 */
export function isGigaChatConfigured(): boolean {
  return !!import.meta.env.VITE_GIGACHAT_CLIENT_SECRET_KEY;
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
