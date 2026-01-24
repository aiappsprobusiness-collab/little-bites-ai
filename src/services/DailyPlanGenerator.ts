/**
 * DailyPlanGenerator - Оптимизированный генератор недельных планов питания
 * 
 * Разбивает неделю на 7 коротких промптов (400-600 токенов каждый)
 * Каждый день генерируется отдельным API call для лучшей производительности
 * Поддерживает streaming для отображения токенов в реальном времени
 */

import { getCachedPrompt, cachePrompt } from "@/utils/streamUtils";

const SUPABASE_URL = "https://hidgiyyunigqazssnydm.supabase.co";
const DAYS_OF_WEEK = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];

export interface ChildData {
  name: string;
  ageMonths: number;
  allergies?: string[];
  dietGoals?: string[];
  weight?: number;
  height?: number;
}

export interface GeneratedIngredient {
  name: string;
  amount: number;
  unit: string;
}

export interface GeneratedMeal {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  cooking_time?: number;
  ingredients?: GeneratedIngredient[];
  steps?: string[];
}

export interface GeneratedDay {
  breakfast: GeneratedMeal;
  lunch: GeneratedMeal;
  snack: GeneratedMeal;
  dinner: GeneratedMeal;
}

export interface GeneratedPlan {
  days: Record<string, GeneratedDay>;
  shopping_list: string[];
  total_calories_week: number;
}

export type ProgressCallback = (dayIndex: number, progress: number, dayName: string) => void;
export type DayChunkCallback = (dayIndex: number, dayPlan: GeneratedDay) => void;
export type StreamChunkCallback = (chunk: string, fullContent: string) => void;

export class DailyPlanGenerator {
  private accessToken: string;
  private maxRetries: number = 3; // Увеличено до 3 для надежности при таймаутах
  private baseDelay: number = 1000;
  private requestTimeout: number = 180000; // 180 секунд (3 минуты) таймаут для перегруженных серверов
  private streamReadTimeout: number = 300000; // 300 секунд (5 минут) для чтения streaming ответа
  private abortController: AbortController | null = null;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  /**
   * Отменяет текущий запрос
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * Оптимизированный короткий промпт для одного дня (~50-80 токенов)
   * Пример JSON вынесен в system prompt
   */
  private createDayPrompt(
    dayName: string,
    childData: ChildData,
    goalsText: string,
    dayIndex: number
  ): string {
    // Добавляем инструкцию о разнообразии на основе дня недели
    const dayNumber = dayIndex + 1;
    let diversityHint = "";
    
    if (dayIndex === 0) {
      diversityHint = " Создай УНИКАЛЬНЫЕ блюда для первого дня.";
    } else if (dayIndex < 3) {
      diversityHint = ` Это уже ${dayNumber}-й день недели. Создай РАЗНЫЕ блюда, не повторяй предыдущие дни. Используй другие крупы, другие способы приготовления.`;
    } else {
      diversityHint = ` Это ${dayNumber}-й день недели. МАКСИМАЛЬНОЕ разнообразие: разные крупы (не только гречка!), разные способы приготовления, разные ингредиенты.`;
    }
    
    // Минимальный промпт с акцентом на разнообразие
    return `${dayName} (${dayNumber}-й день).${diversityHint} ${childData.name}, ${childData.ageMonths} мес.${childData.allergies?.length ? ` ИСКЛЮЧИ: ${childData.allergies.join(", ")}.` : ""} Цели: ${goalsText || "Сбалансированное"}. Верни только валидный JSON без пояснений.`;
  }

  /**
   * Выполняет запрос с retry логикой и таймаутами
   */
  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    maxRetries: number = this.maxRetries
  ): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      // Создаем новый AbortController для каждой попытки
      this.abortController = new AbortController();
      
      // Для streaming запросов используем больший таймаут на установку соединения
      // Сам streaming будет читаться с отдельным таймаутом
      const isStreaming = (options.body as string)?.includes('"stream":true');
      const connectionTimeout = isStreaming ? 60000 : this.requestTimeout; // 60 сек для установки streaming соединения
      
      const timeoutId = setTimeout(() => {
        console.warn(`Request connection timeout after ${connectionTimeout}ms (attempt ${attempt + 1})`);
        this.abortController?.abort();
      }, connectionTimeout);

      try {
        const response = await fetch(url, {
          ...options,
          signal: this.abortController.signal,
          keepalive: true, // Продолжение запроса при переключении вкладок - КРИТИЧНО для работы в фоне
          cache: 'no-store', // Не кэшировать запросы
        });

        clearTimeout(timeoutId);
        
        // Для streaming ответов не проверяем ok сразу - поток может быть еще не начат
        if (!isStreaming && !response.ok && response.status >= 500) {
          throw new Error(`Server error: ${response.status}`);
        }

        // Если rate limited, retry с backoff
        if (response.status === 429) {
          const delay = Math.min(this.baseDelay * Math.pow(2, attempt), 10000); // Максимум 10 секунд
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        return response;
      } catch (err) {
        clearTimeout(timeoutId);
        
        const isTimeout = err instanceof Error && (err.name === 'AbortError' || err.message.includes('timeout'));
        const isNetworkError = err instanceof TypeError; // Network errors
        
        if (isTimeout || isNetworkError) {
          lastError = new Error(`Request failed: ${isTimeout ? 'timeout' : 'network error'}`);
          
          // Для таймаутов увеличиваем задержку перед следующей попыткой
          if (isTimeout && attempt < maxRetries - 1) {
            const delay = Math.min(this.baseDelay * Math.pow(2, attempt + 1), 10000); // До 10 секунд для таймаутов
            console.log(`Timeout on attempt ${attempt + 1}, retrying in ${delay}ms...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue; // Продолжаем с новой попытки
          }
        } else {
          lastError = err instanceof Error ? err : new Error(String(err));
        }

        // Не ретраим на последней попытке
        if (attempt < maxRetries - 1) {
          const delay = Math.min(this.baseDelay * Math.pow(2, attempt), 5000); // Максимум 5 секунд между попытками
          console.log(`Error on attempt ${attempt + 1}, retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      } finally {
        this.abortController = null;
      }
    }

    throw lastError || new Error("Max retries exceeded");
  }

  /**
   * Генерирует план для одного дня (с поддержкой streaming)
   */
  async generateDayPlan(
    dayName: string,
    childData: ChildData,
    goalsText: string,
    dayIndex: number,
    stream: boolean = true, // Streaming по умолчанию для быстрого ответа
    onStreamChunk?: StreamChunkCallback
  ): Promise<GeneratedDay> {
    const prompt = this.createDayPrompt(dayName, childData, goalsText, dayIndex);

    const response = await this.fetchWithRetry(
      `${SUPABASE_URL}/functions/v1/deepseek-chat`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.accessToken}`,
        },
        body: JSON.stringify({
          type: "single_day",
          childData,
          stream: stream, // Streaming по умолчанию для быстрого ответа
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || `Ошибка генерации для ${dayName}`);
    }

    let messageText = "";

    // Обработка streaming ответа
    if (stream && response.body && response.headers.get("content-type")?.includes("text/event-stream")) {
      try {
        const { readSSEStream } = await import("@/utils/streamUtils");
        let accumulatedText = "";
        
        // Для streaming используем увеличенный таймаут на чтение потока (5 минут)
        messageText = await readSSEStream(
          response,
          (chunk) => {
            if (chunk.content) {
              accumulatedText += chunk.content;
              if (onStreamChunk) {
                onStreamChunk(chunk.content, accumulatedText);
              }
            }
          },
          (error) => {
            console.error(`[${dayName}] Stream read error:`, error);
          },
          this.streamReadTimeout // 5 минут таймаут на чтение stream
        );
        messageText = accumulatedText || messageText;
      } catch (streamError) {
        console.error(`[${dayName}] Streaming error:`, streamError);
        throw new Error(`Ошибка при обработке streaming ответа: ${streamError instanceof Error ? streamError.message : String(streamError)}`);
      }
    } else {
      // Обработка обычного ответа (backward compatibility)
      try {
        const data = await response.json();
        messageText = data.message || "";
      } catch (jsonError) {
        console.error(`[${dayName}] Failed to parse JSON response:`, jsonError);
        const text = await response.text();
        console.error(`[${dayName}] Response text:`, text.substring(0, 1000));
        throw new Error(`Не удалось получить ответ от сервера для ${dayName}`);
      }
    }

    // Логируем полученный ответ для отладки
    console.log(`[${dayName}] Received response (length: ${messageText.length}):`, messageText.substring(0, 500));

    // С response_format: json_object ответ должен быть чистым JSON
    // Но на всякий случай поддерживаем и markdown блоки (fallback)
    let jsonStr = messageText.trim();
    
    // Убираем markdown блоки если есть
    const jsonMatch = messageText.match(/```json\s*([\s\S]*?)\s*```/) ||
                      messageText.match(/```\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    } else {
      // Пробуем найти JSON объект напрямую
      const jsonStart = messageText.indexOf('{');
      const jsonEnd = messageText.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        jsonStr = messageText.substring(jsonStart, jsonEnd + 1);
      }
    }
    
    let dayPlan;
    try {
      dayPlan = JSON.parse(jsonStr);
    } catch (parseError) {
      // Проверяем, не обрезан ли JSON из-за max_tokens
      const isTruncated = jsonStr.length > 1000 && !jsonStr.endsWith('}');
      if (isTruncated) {
        console.error(`[${dayName}] JSON appears to be truncated (length: ${jsonStr.length})`);
        console.error(`[${dayName}] JSON string (last 500 chars):`, jsonStr.substring(jsonStr.length - 500));
        throw new Error(`Ответ от модели обрезан (превышен лимит токенов). Попробуйте снова.`);
      }
      
      console.error(`[${dayName}] JSON parse error:`, parseError);
      console.error(`[${dayName}] JSON string:`, jsonStr.substring(0, 500));
      console.error(`[${dayName}] Full response length:`, messageText.length);
      throw new Error(`Не удалось распарсить JSON для ${dayName}: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
    }

    // Normalize keys
    const mealTypeMap: Record<string, keyof GeneratedDay> = {
      завтрак: "breakfast",
      breakfast: "breakfast",
      обед: "lunch",
      lunch: "lunch",
      полдник: "snack",
      snack: "snack",
      ужин: "dinner",
      dinner: "dinner",
    };

    const normalizedDay: Partial<GeneratedDay> = {};
    for (const [mealKey, meal] of Object.entries(dayPlan)) {
      const englishKey =
        mealTypeMap[mealKey.toLowerCase()] || (mealKey as keyof GeneratedDay);
      if (["breakfast", "lunch", "snack", "dinner"].includes(englishKey)) {
        normalizedDay[englishKey] = meal as GeneratedMeal;
      }
    }

    // Проверяем, что все приемы пищи присутствуют
    if (
      !normalizedDay.breakfast ||
      !normalizedDay.lunch ||
      !normalizedDay.snack ||
      !normalizedDay.dinner
    ) {
      console.error(`[${dayName}] Incomplete plan. Missing meals:`, {
        breakfast: !!normalizedDay.breakfast,
        lunch: !!normalizedDay.lunch,
        snack: !!normalizedDay.snack,
        dinner: !!normalizedDay.dinner,
        rawPlan: dayPlan
      });
      throw new Error(`Неполный план для ${dayName}. Отсутствуют некоторые приемы пищи.`);
    }

    console.log(`[${dayName}] Successfully parsed plan`);
    return normalizedDay as GeneratedDay;
  }

  /**
   * Генерирует список покупок из всех ингредиентов
   */
  generateShoppingList(days: Record<string, GeneratedDay>): string[] {
    const allIngredients: Map<string, { amount: number; unit: string }> = new Map();

    for (const dayPlan of Object.values(days)) {
      for (const meal of Object.values(dayPlan)) {
        if (meal?.ingredients) {
          meal.ingredients.forEach((ing) => {
            const key = ing.name.toLowerCase().trim();
            const existing = allIngredients.get(key);

            if (existing) {
              // Суммируем количество, если единицы измерения совпадают
              if (existing.unit === ing.unit) {
                existing.amount += ing.amount;
              } else {
                // Если единицы разные, оставляем как есть
                allIngredients.set(key, {
                  amount: ing.amount,
                  unit: ing.unit,
                });
              }
            } else {
              allIngredients.set(key, {
                amount: ing.amount,
                unit: ing.unit,
              });
            }
          });
        }
      }
    }

    // Форматируем в строки
    const shoppingList: string[] = [];
    for (const [name, { amount, unit }] of allIngredients.entries()) {
      const formattedName = name.charAt(0).toUpperCase() + name.slice(1);
      shoppingList.push(`${formattedName} - ${amount} ${unit}`);
    }

    return shoppingList.sort();
  }

  /**
   * Генерирует план на всю неделю (с поддержкой streaming)
   */
  async generateWeekPlan(
    childData: ChildData,
    goalsText: string,
    onProgress?: ProgressCallback,
    onDayChunk?: DayChunkCallback,
    stream: boolean = true, // Streaming по умолчанию
    onStreamChunk?: (dayIndex: number, chunk: string, fullContent: string) => void
  ): Promise<GeneratedPlan> {
    const generatedDays: Record<string, GeneratedDay> = {};

    // Генерируем каждый день последовательно (без контекста предыдущих дней для скорости)
    for (let i = 0; i < DAYS_OF_WEEK.length; i++) {
      const dayName = DAYS_OF_WEEK[i];

        try {
          // Генерируем план для дня (с streaming если включен, передаем индекс дня для разнообразия)
          const dayPlan = await this.generateDayPlan(
            dayName,
            childData,
            goalsText,
            i, // Индекс дня для инструкций о разнообразии
            stream,
            stream && onStreamChunk
              ? (chunk, fullContent) => onStreamChunk(i, chunk, fullContent)
              : undefined
          );

        generatedDays[dayName] = dayPlan;

        // Вызываем callback для прогресса
        if (onProgress) {
          const progress = Math.round(((i + 1) / DAYS_OF_WEEK.length) * 90);
          onProgress(i, progress, dayName);
        }

        // Вызываем callback для chunk (real-time updates)
        if (onDayChunk) {
          onDayChunk(i, dayPlan);
        }

        // Небольшая задержка между запросами для избежания rate limiting (уменьшено с 500 до 200мс)
        if (i < DAYS_OF_WEEK.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      } catch (dayError) {
        console.error(`Error generating ${dayName}:`, dayError);
        // Продолжаем с другими днями, пропускаем неудачный
        // Можно добавить логику для retry конкретного дня
      }
    }

    if (Object.keys(generatedDays).length === 0) {
      throw new Error("Не удалось сгенерировать ни одного дня");
    }

    // Генерируем список покупок
    const shoppingList = this.generateShoppingList(generatedDays);

    // Вычисляем общие калории за неделю
    let totalCalories = 0;
    for (const dayPlan of Object.values(generatedDays)) {
      for (const meal of Object.values(dayPlan)) {
        totalCalories += meal?.calories || 0;
      }
    }

    // Финальный прогресс
    if (onProgress) {
      onProgress(DAYS_OF_WEEK.length - 1, 100, "Завершено");
    }

    return {
      days: generatedDays,
      shopping_list: shoppingList,
      total_calories_week: totalCalories,
    };
  }
}
