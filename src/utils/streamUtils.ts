/**
 * Утилиты для обработки Server-Sent Events (SSE) stream от DeepSeek API
 */

export interface StreamChunk {
  content: string;
  done: boolean;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Парсит SSE chunk из формата DeepSeek API
 */
function parseSSEChunk(chunk: string): StreamChunk | null {
  // Формат: data: {"id":"...","object":"chat.completion.chunk","created":...,"model":"...","choices":[{"index":0,"delta":{"content":"..."},"finish_reason":null}]}
  // EOF: data: [DONE]
  
  if (!chunk.trim()) {
    return null;
  }

  // Обработка EOF чанка
  if (chunk === "data: [DONE]" || chunk.trim() === "data: [DONE]") {
    return { content: "", done: true };
  }

  if (!chunk.startsWith("data: ")) {
    return null;
  }

  try {
    const jsonStr = chunk.replace("data: ", "").trim();
    
    // Проверка на [DONE] без кавычек
    if (jsonStr === "[DONE]") {
      return { content: "", done: true };
    }

    const data = JSON.parse(jsonStr);

    if (data.choices && data.choices.length > 0) {
      const choice = data.choices[0];
      const delta = choice.delta || {};
      const content = delta.content || "";
      const finishReason = choice.finish_reason;

      return {
        content,
        done: finishReason !== null && finishReason !== undefined,
        usage: data.usage, // Usage обычно приходит в последнем chunk
      };
    }
  } catch (error) {
    // Игнорируем ошибки парсинга для некорректных chunks
    console.warn("Error parsing SSE chunk:", error, chunk);
    return null;
  }

  return null;
}

/**
 * Читает SSE stream и вызывает callback для каждого chunk
 * @param response - Response объект с stream
 * @param onChunk - Callback для каждого chunk
 * @param onError - Callback для ошибок
 * @param readTimeout - Таймаут на чтение (мс), по умолчанию 5 минут
 */
export async function readSSEStream(
  response: Response,
  onChunk: (chunk: StreamChunk) => void,
  onError?: (error: Error) => void,
  readTimeout: number = 300000 // 5 минут по умолчанию
): Promise<string> {
  if (!response.body) {
    throw new Error("Response body is null");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullContent = "";
  let lastDataTime = Date.now();
  let timeoutId: NodeJS.Timeout | null = null;

  const resetTimeout = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    lastDataTime = Date.now();
    timeoutId = setTimeout(() => {
      const timeSinceLastData = Date.now() - lastDataTime;
      if (timeSinceLastData >= readTimeout) {
        console.warn(`Stream read timeout: no data for ${readTimeout}ms`);
        reader.cancel();
        if (onError) {
          onError(new Error(`Stream read timeout after ${readTimeout}ms`));
        }
      }
    }, readTimeout);
  };

  resetTimeout(); // Начинаем отсчет таймаута

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        // Обрабатываем оставшийся буфер
        if (buffer.trim()) {
          const lines = buffer.split("\n");
          for (const line of lines) {
            if (line.trim()) {
              const chunk = parseSSEChunk(line);
              if (chunk && chunk.content) {
                fullContent += chunk.content;
                onChunk(chunk);
              }
            }
          }
        }
        break;
      }

      // Декодируем chunk
      buffer += decoder.decode(value, { stream: true });
      resetTimeout(); // Продлеваем таймаут при получении данных
      
      // Обрабатываем полные строки
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Последняя неполная строка остается в буфере

      for (const line of lines) {
        if (line.trim()) {
          const chunk = parseSSEChunk(line);
          if (chunk) {
            if (chunk.content) {
              fullContent += chunk.content;
            }
            onChunk(chunk);
            
            if (chunk.done) {
              if (timeoutId) {
                clearTimeout(timeoutId);
              }
              return fullContent;
            }
          }
        }
      }
    }
  } catch (error) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    const err = error instanceof Error ? error : new Error(String(error));
    if (onError) {
      onError(err);
    }
    throw err;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    reader.releaseLock();
  }

  return fullContent;
}

/**
 * Кэширование системных промптов в localStorage (аналог AssetManager для веба)
 */
const PROMPT_CACHE_KEY_PREFIX = "deepseek_prompt_";

export function getCachedPrompt(type: string, childData?: any): string | null {
  try {
    const cacheKey = `${PROMPT_CACHE_KEY_PREFIX}${type}_${JSON.stringify(childData || {})}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const { prompt, timestamp } = JSON.parse(cached);
      // Кэш действителен 24 часа
      if (Date.now() - timestamp < 24 * 60 * 60 * 1000) {
        return prompt;
      }
    }
  } catch (error) {
    console.error("Error reading prompt cache:", error);
  }
  return null;
}

export function cachePrompt(type: string, prompt: string, childData?: any): void {
  try {
    const cacheKey = `${PROMPT_CACHE_KEY_PREFIX}${type}_${JSON.stringify(childData || {})}`;
    localStorage.setItem(
      cacheKey,
      JSON.stringify({
        prompt,
        timestamp: Date.now(),
      })
    );
  } catch (error) {
    console.error("Error caching prompt:", error);
  }
}
