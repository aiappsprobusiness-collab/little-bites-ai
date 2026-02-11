/**
 * Enhanced Speech-to-Text Service
 * 
 * Улучшенный сервис для распознавания речи с:
 * - Проверкой разрешений
 * - Fallback на альтернативные методы
 * - Поддержкой русского языка (ru-RU)
 * - Интеграцией с Android через Capacitor
 * 
 * ВАЖНО о Web Speech API:
 * - Почти всегда требует интернет-соединение и доступ к серверам Google
 * - Офлайн режим возможен только в очень узких сценариях (часть Chrome на Android 
 *   с предзагруженными языковыми пакетами), но поведение нестабильно, особенно для русского языка
 * - На Android Chrome сильно зависит от установленного сервиса распознавания (Google/производитель),
 *   при его отсутствии или блокировках часто не работает вообще
 * - НЕ рекомендуется полагаться на офлайн режим Web Speech API
 * 
 * Android Native SpeechRecognizer:
 * - Работает полностью офлайн (не требует интернет)
 * - Зависит от установленного сервиса распознавания (Google/производитель)
 */

import { Capacitor } from '@capacitor/core';
import { safeLog, safeError, safeWarn } from "@/utils/safeLogger";

export interface SpeechToTextResponse {
  text: string;
  language: string;
  confidence?: number;
  isFinal: boolean;
}

export interface SpeechToTextError {
  error: string;
  code?: string;
}

export type SpeechRecognitionMethod = 'web-speech' | 'android-native' | 'vosk' | 'whisper';

export interface SpeechRecognitionOptions {
  language?: string;
  continuous?: boolean;
  interimResults?: boolean;
  maxAlternatives?: number;
  onResult?: (result: SpeechToTextResponse) => void;
  onError?: (error: SpeechToTextError) => void;
  onEnd?: () => void;
}

/**
 * Проверяет доступность разрешений для микрофона
 */
export async function checkMicrophonePermission(): Promise<boolean> {
  try {
    if (Capacitor.isNativePlatform()) {
      // Для нативных платформ пытаемся запросить доступ напрямую
      // В Android это будет обработано через нативный код
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
        return true;
      } catch {
        return false;
      }
    } else {
      // Для веб-платформы используем MediaDevices API
      if (navigator.permissions) {
        try {
          const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
          return result.state === 'granted';
        } catch {
          // Если query не поддерживается, пробуем напрямую
        }
      }
      // Fallback: пытаемся запросить доступ напрямую
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
        return true;
      } catch {
        return false;
      }
    }
  } catch (error) {
    safeError('Error checking microphone permission:', error);
    return false;
  }
}

/**
 * Запрашивает разрешение на использование микрофона
 */
export async function requestMicrophonePermission(): Promise<boolean> {
  try {
    if (Capacitor.isNativePlatform()) {
      // Для нативных платформ запрашиваем через getUserMedia
      // Android автоматически покажет диалог разрешений
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
        return true;
      } catch (error: any) {
        safeError('Error requesting microphone permission:', error);
        return false;
      }
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
        return true;
      } catch (error: any) {
        safeError('Error requesting microphone permission:', error);
        return false;
      }
    }
  } catch (error) {
    safeError('Error requesting microphone permission:', error);
    return false;
  }
}

/**
 * Проверяет доступность методов распознавания речи
 */
export function getAvailableMethods(): SpeechRecognitionMethod[] {
  const methods: SpeechRecognitionMethod[] = [];

  // Проверяем Web Speech API
  if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    methods.push('web-speech');
  }

  // Проверяем Android нативную поддержку
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    methods.push('android-native');
  }

  // Vosk и Whisper требуют дополнительной настройки
  // methods.push('vosk', 'whisper');

  return methods;
}

/**
 * Проверяет, поддерживается ли русский язык
 */
export function isRussianLanguageSupported(method: SpeechRecognitionMethod): boolean {
  if (method === 'web-speech') {
    // Web Speech API поддерживает русский язык
    return true;
  }
  if (method === 'android-native') {
    // Android SpeechRecognizer поддерживает русский (ru-RU)
    return true;
  }
  return false;
}

/**
 * Создает экземпляр Web Speech Recognition
 */
function createWebSpeechRecognition(options: SpeechRecognitionOptions): any {
  const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SpeechRecognitionClass) {
    return null;
  }

  const recognition = new SpeechRecognitionClass();
  recognition.continuous = options.continuous ?? true;
  recognition.interimResults = options.interimResults ?? true;
  recognition.lang = options.language || 'ru-RU';
  recognition.maxAlternatives = options.maxAlternatives ?? 1;

  recognition.onresult = (event: any) => {
    let interimTranscript = '';
    let finalTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      const confidence = event.results[i][0].confidence || 0;
      
      if (event.results[i].isFinal) {
        finalTranscript += transcript + ' ';
      } else {
        interimTranscript += transcript;
      }

      if (options.onResult) {
        options.onResult({
          text: (finalTranscript + interimTranscript).trim(),
          language: recognition.lang,
          confidence,
          isFinal: event.results[i].isFinal,
        });
      }
    }
  };

  recognition.onerror = (event: any) => {
    if (options.onError) {
      let errorMessage = 'Ошибка распознавания речи';
      let errorCode = event.error;

      switch (event.error) {
        case 'no-speech':
          errorMessage = 'Речь не обнаружена';
          break;
        case 'audio-capture':
          errorMessage = 'Микрофон не найден';
          break;
        case 'not-allowed':
          errorMessage = 'Доступ к микрофону запрещен';
          break;
        case 'network':
          errorMessage = 'Web Speech API не может подключиться к серверам Google. Это может быть из-за блокировки доступа к Google или проблем с интернетом. Решения: 1) Используйте VPN, 2) Введите текст вручную, 3) Используйте Android приложение (работает офлайн)';
          break;
        case 'aborted':
          errorMessage = 'Распознавание прервано';
          break;
        case 'service-not-allowed':
          errorMessage = 'Сервис распознавания недоступен';
          break;
        default:
          errorMessage = `Ошибка: ${event.error}`;
      }

      options.onError({
        error: errorMessage,
        code: errorCode,
      });
    }
  };

  recognition.onend = () => {
    if (options.onEnd) {
      options.onEnd();
    }
  };

  recognition.onstart = () => {
    safeLog('Web Speech Recognition started');
  };

  return recognition;
}

/**
 * Создает экземпляр Android Native Speech Recognition
 * Использует нативный Capacitor plugin (если доступен)
 */
async function createAndroidNativeRecognition(options: SpeechRecognitionOptions): Promise<any> {
  try {
    // Пытаемся использовать нативный плагин через Capacitor
    const { Plugins } = await import('@capacitor/core');
    
    // Проверяем доступность кастомного плагина
    const SpeechRecognition = (Plugins as any).SpeechRecognition;
    if (!SpeechRecognition) {
      safeWarn('SpeechRecognition plugin not available, using Web Speech API fallback');
      return null;
    }

    return {
      start: async () => {
        try {
          // Проверяем разрешения
          const permissionResult = await SpeechRecognition.checkPermission();
          if (!permissionResult.granted) {
            const requestResult = await SpeechRecognition.requestPermission();
            if (!requestResult.granted) {
              if (options.onError) {
                options.onError({
                  error: 'Microphone permission denied',
                  code: 'not-allowed',
                });
              }
              return;
            }
          }

          const result = await SpeechRecognition.start({
            language: options.language || 'ru-RU',
            maxResults: options.maxAlternatives || 1,
            partialResults: options.interimResults || true,
          });
          
          if (result.matches && result.matches.length > 0) {
            if (options.onResult) {
              options.onResult({
                text: result.matches[0],
                language: result.language || 'ru-RU',
                isFinal: true,
              });
            }
          }
        } catch (error: any) {
          if (options.onError) {
            options.onError({
              error: error.message || 'Failed to start Android speech recognition',
              code: 'android-native-error',
            });
          }
        }
      },
      stop: async () => {
        try {
          const { Plugins } = await import('@capacitor/core');
          const SpeechRecognition = (Plugins as any).SpeechRecognition;
          if (SpeechRecognition) {
            await SpeechRecognition.stop();
          }
        } catch (error) {
          safeError('Error stopping Android recognition:', error);
        }
      },
      abort: async () => {
        try {
          const { Plugins } = await import('@capacitor/core');
          const SpeechRecognition = (Plugins as any).SpeechRecognition;
          if (SpeechRecognition) {
            await SpeechRecognition.stop();
          }
        } catch (error) {
          safeError('Error aborting Android recognition:', error);
        }
      },
    };
  } catch (error) {
    safeWarn('Android native recognition plugin not available, using Web Speech API fallback');
    return null;
  }
}

/**
 * Основной класс для распознавания речи
 */
export class SpeechRecognitionService {
  private recognition: any = null;
  private currentMethod: SpeechRecognitionMethod | null = null;
  private isRecording: boolean = false;
  private options: SpeechRecognitionOptions;

  constructor(options: SpeechRecognitionOptions = {}) {
    this.options = {
      language: 'ru-RU',
      continuous: true,
      interimResults: true,
      maxAlternatives: 1,
      ...options,
    };
  }

  /**
   * Инициализирует распознавание речи с проверкой разрешений
   */
  async initialize(): Promise<{ success: boolean; method?: SpeechRecognitionMethod; error?: string }> {
    // Проверяем разрешения
    const hasPermission = await checkMicrophonePermission();
    if (!hasPermission) {
      const granted = await requestMicrophonePermission();
      if (!granted) {
        return {
          success: false,
          error: 'Необходимо разрешение на использование микрофона',
        };
      }
    }

    // Определяем доступные методы
    const availableMethods = getAvailableMethods();
    if (availableMethods.length === 0) {
      return {
        success: false,
        error: 'Распознавание речи не поддерживается в этом браузере/устройстве',
      };
    }

    // Выбираем метод (приоритет: android-native для офлайн, затем web-speech)
    // Android Native работает офлайн, поэтому имеет приоритет
    let method: SpeechRecognitionMethod | null = null;
    
    // Сначала пробуем Android Native (работает офлайн)
    if (availableMethods.includes('android-native') && isRussianLanguageSupported('android-native')) {
      method = 'android-native';
    } else {
      // Fallback на Web Speech API
      for (const m of availableMethods) {
        if (isRussianLanguageSupported(m)) {
          method = m;
          break;
        }
      }
    }

    if (!method) {
      return {
        success: false,
        error: 'Русский язык не поддерживается',
      };
    }

    this.currentMethod = method;

    // Создаем экземпляр распознавания
    if (method === 'web-speech') {
      this.recognition = createWebSpeechRecognition(this.options);
    } else if (method === 'android-native') {
      this.recognition = await createAndroidNativeRecognition(this.options);
      if (!this.recognition) {
        // Fallback на web-speech если android-native недоступен
        this.recognition = createWebSpeechRecognition(this.options);
        this.currentMethod = 'web-speech';
      }
    }

    if (!this.recognition) {
      return {
        success: false,
        error: 'Не удалось инициализировать распознавание речи',
      };
    }

    return {
      success: true,
      method: this.currentMethod,
    };
  }

  /**
   * Начинает распознавание речи с автоматическим fallback при ошибках
   */
  async start(): Promise<void> {
    if (this.isRecording) {
      safeWarn('Recognition is already running');
      return;
    }

    if (!this.recognition) {
      const initResult = await this.initialize();
      if (!initResult.success) {
        throw new Error(initResult.error || 'Failed to initialize recognition');
      }
    }

    try {
      if (this.currentMethod === 'web-speech' && this.recognition) {
        // Устанавливаем обработчик ошибок для автоматического fallback
        const originalOnError = this.options.onError;
        this.recognition.onerror = (event: any) => {
          // Если это network ошибка и доступен Android Native, пробуем его
          if (event.error === 'network' && Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
            safeLog('Network error detected, trying Android Native fallback...');
            this.recognition = null;
            this.currentMethod = null;
            // Пробуем переключиться на Android Native
            this.initialize().then(() => {
              if (this.recognition && this.currentMethod === 'android-native') {
                this.recognition.start().then(() => {
                  this.isRecording = true;
                }).catch((err: any) => {
                  if (originalOnError) {
                    originalOnError({
                      error: `Не удалось использовать Android Native: ${err.message}`,
                      code: 'android-native-error',
                    });
                  }
                });
              } else if (originalOnError) {
                originalOnError({
                  error: 'Web Speech API недоступен, а Android Native не настроен. Используйте VPN или введите текст вручную.',
                  code: 'network',
                });
              }
            });
            return;
          }
          // Вызываем оригинальный обработчик ошибок
          if (originalOnError) {
            let errorMessage = 'Ошибка распознавания речи';
            switch (event.error) {
              case 'network':
                errorMessage = 'Web Speech API не может подключиться к серверам Google. Используйте VPN или введите текст вручную.';
                break;
              default:
                errorMessage = `Ошибка: ${event.error}`;
            }
            originalOnError({
              error: errorMessage,
              code: event.error,
            });
          }
        };
        
        this.recognition.start();
        this.isRecording = true;
      } else if (this.currentMethod === 'android-native' && this.recognition) {
        // Для Android нативного метода
        await this.recognition.start();
        this.isRecording = true;
      }
    } catch (error: any) {
      this.isRecording = false;
      throw new Error(`Failed to start recognition: ${error.message}`);
    }
  }

  /**
   * Останавливает распознавание речи
   */
  stop(): void {
    if (!this.isRecording || !this.recognition) {
      return;
    }

    try {
      if (this.currentMethod === 'web-speech' && this.recognition) {
        this.recognition.stop();
      } else if (this.currentMethod === 'android-native' && this.recognition) {
        this.recognition.stop();
      }
      this.isRecording = false;
    } catch (error) {
      safeError('Error stopping recognition:', error);
      this.isRecording = false;
    }
  }

  /**
   * Отменяет распознавание речи
   */
  abort(): void {
    if (!this.recognition) {
      return;
    }

    try {
      if (this.currentMethod === 'web-speech' && this.recognition) {
        this.recognition.abort();
      } else if (this.currentMethod === 'android-native' && this.recognition) {
        this.recognition.abort();
      }
      this.isRecording = false;
    } catch (error) {
      safeError('Error aborting recognition:', error);
      this.isRecording = false;
    }
  }

  /**
   * Проверяет, записывается ли речь
   */
  getIsRecording(): boolean {
    return this.isRecording;
  }

  /**
   * Получает текущий метод распознавания
   */
  getCurrentMethod(): SpeechRecognitionMethod | null {
    return this.currentMethod;
  }

  /**
   * Уничтожает экземпляр распознавания
   */
  destroy(): void {
    this.abort();
    this.recognition = null;
    this.currentMethod = null;
  }
}

/**
 * Проверяет, настроен ли сервис распознавания речи
 */
export function isSpeechToTextConfigured(): boolean {
  // Проверяем доступность Web Speech API или других методов
  return getAvailableMethods().length > 0;
}

/**
 * Конвертирует аудио файл в base64
 */
export async function audioFileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
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
