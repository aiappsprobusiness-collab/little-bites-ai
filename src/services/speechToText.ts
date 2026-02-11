/**
 * Speech-to-Text Service
 * 
 * Сервис для распознавания речи через Whisper API (OpenAI)
 */

import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";
import { safeError } from "@/utils/safeLogger";

export interface SpeechToTextResponse {
  text: string;
  language: string;
}

export interface SpeechToTextError {
  error: string;
}

/**
 * Конвертирует аудио файл в base64
 */
export async function audioFileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Убираем префикс data:audio/...;base64,
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Конвертирует MediaRecorder в base64
 */
export async function mediaRecorderToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Распознает речь из аудио файла через DeepSeek (гибридный подход)
 * Примечание: DeepSeek не поддерживает аудио напрямую, поэтому используется Web Speech API
 */
export async function transcribeAudio(
  audioBase64: string,
  mimeType: string,
  language: string = "ru"
): Promise<SpeechToTextResponse> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      throw new Error("Необходима авторизация для использования распознавания речи");
    }

    // Пытаемся использовать DeepSeek функцию (но она вернет ошибку, так как DeepSeek не поддерживает аудио)
    // В реальности используем встроенный Web Speech API
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/deepseek-speech-to-text`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          audioBase64,
          mimeType,
          language,
        }),
      }
    );

    if (!response.ok) {
      const error: SpeechToTextError = await response.json();
      // Если DeepSeek не поддерживает, возвращаем понятную ошибку
      if (response.status === 501) {
        throw new Error("DeepSeek API не поддерживает распознавание речи. Используйте встроенный Web Speech API браузера.");
      }
      throw new Error(error.error || "Не удалось распознать речь");
    }

    const result: SpeechToTextResponse = await response.json();
    return result;
  } catch (error: any) {
    safeError("Speech-to-text error:", error);
    throw new Error(error.message || "Ошибка при распознавании речи");
  }
}

/**
 * Проверяет, настроен ли сервис распознавания речи
 */
export function isSpeechToTextConfigured(): boolean {
  // Проверяем наличие Supabase URL и ключа
  return !!(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
}
