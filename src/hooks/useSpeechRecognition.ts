import { useState, useRef, useCallback, useEffect } from "react";
import {
  SpeechRecognitionService,
  checkMicrophonePermission,
  requestMicrophonePermission,
  getAvailableMethods,
} from "@/services/speechToTextEnhanced";

export interface UseSpeechRecognitionOptions {
  language?: string;
  /** Вызывается при финальном результате (после остановки или при isFinal). Текст подставляется в поле и можно авто-отправить. */
  onFinalTranscript?: (text: string) => void;
  onError?: (message: string) => void;
}

export function useSpeechRecognition(options: UseSpeechRecognitionOptions = {}) {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const serviceRef = useRef<SpeechRecognitionService | null>(null);
  const finalAccumulatorRef = useRef<string>("");
  const { onFinalTranscript, onError, language = "ru-RU" } = options;

  const handleResult = useCallback(
    (result: { text: string; isFinal: boolean }) => {
      if (result.isFinal && result.text?.trim()) {
        finalAccumulatorRef.current += (finalAccumulatorRef.current ? " " : "") + result.text.trim();
      }
    },
    []
  );

  const handleEnd = useCallback(() => {
    setIsListening(false);
    const text = finalAccumulatorRef.current.trim();
    finalAccumulatorRef.current = "";
    if (text && onFinalTranscript) {
      onFinalTranscript(text);
    }
  }, [onFinalTranscript]);

  useEffect(() => {
    return () => {
      if (serviceRef.current) {
        serviceRef.current.destroy();
        serviceRef.current = null;
      }
    };
  }, []);

  const start = useCallback(async () => {
    setError(null);
    finalAccumulatorRef.current = "";

    const methods = getAvailableMethods();
    if (methods.length === 0) {
      const msg = "Распознавание речи не поддерживается. Используйте Chrome, Edge или Safari.";
      setError(msg);
      onError?.(msg);
      return;
    }

    const hasPermission = await checkMicrophonePermission();
    if (!hasPermission) {
      const granted = await requestMicrophonePermission();
      if (!granted) {
        const msg = "Нужен доступ к микрофону";
        setError(msg);
        onError?.(msg);
        return;
      }
    }

    if (serviceRef.current) {
      serviceRef.current.destroy();
      serviceRef.current = null;
    }

    const service = new SpeechRecognitionService({
      language,
      continuous: true,
      interimResults: true,
      onResult: (res) => handleResult({ text: res.text, isFinal: res.isFinal }),
      onError: (err) => {
        setError(err.error);
        onError?.(err.error);
      },
      onEnd: handleEnd,
    });
    serviceRef.current = service;

    const init = await service.initialize();
    if (!init.success) {
      setError(init.error || "Ошибка инициализации");
      onError?.(init.error || "Ошибка инициализации");
      return;
    }

    try {
      await service.start();
      setIsListening(true);
    } catch (e: any) {
      const msg = e?.message || "Не удалось начать запись";
      setError(msg);
      onError?.(msg);
    }
  }, [language, handleResult, handleEnd, onError]);

  const stop = useCallback(() => {
    if (serviceRef.current) {
      serviceRef.current.stop();
      serviceRef.current = null;
    }
    setIsListening(false);
    // Финальный текст уйдёт через onEnd callback сервиса
    const text = finalAccumulatorRef.current.trim();
    finalAccumulatorRef.current = "";
    if (text && onFinalTranscript) {
      onFinalTranscript(text);
    }
  }, [onFinalTranscript]);

  const toggle = useCallback(() => {
    if (isListening) {
      stop();
    } else {
      start();
    }
  }, [isListening, start, stop]);

  return { isListening, error, start, stop, toggle };
}
