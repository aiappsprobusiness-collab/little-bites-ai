import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Send, Loader2, Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";

interface ChatInputPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (message: string) => void;
  isSending: boolean;
}

// Extend window for TypeScript
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export function ChatInputPanel({ isOpen, onClose, onSend, isSending }: ChatInputPanelProps) {
  const { toast } = useToast();
  const [input, setInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const finalTranscriptRef = useRef<string>('');
  const networkErrorCountRef = useRef<number>(0);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Функция для создания нового экземпляра распознавания речи
  const createRecognition = () => {
    // Проверяем поддержку API
    const hasWebkit = 'webkitSpeechRecognition' in window;
    const hasStandard = 'SpeechRecognition' in window;
    
    if (!hasWebkit && !hasStandard) {
      console.warn('Speech Recognition API not available');
      return null;
    }

    try {
      const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognitionClass();
      
      // Проверяем, что объект создан корректно
      if (!recognition) {
        console.error('Failed to create SpeechRecognition instance');
        return null;
      }
      
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'ru-RU';
      
      // Добавляем максимальное время ожидания
      recognition.maxAlternatives = 1;

      recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let newFinalTranscript = '';

        // Обрабатываем все результаты
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            newFinalTranscript += transcript + ' ';
          } else {
            interimTranscript += transcript;
          }
        }

        // Обновляем финальный текст
        if (newFinalTranscript) {
          finalTranscriptRef.current += newFinalTranscript;
        }

        // Показываем финальный текст + промежуточный
        setInput((finalTranscriptRef.current + interimTranscript).trim());
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error, event);
        
        // Обрабатываем различные типы ошибок
        if (event.error === 'no-speech') {
          // Пользователь не говорил - это нормально, просто останавливаем
          setIsRecording(false);
          networkErrorCountRef.current = 0; // Сбрасываем счетчик при нормальной остановке
        } else if (event.error === 'audio-capture') {
          // Нет микрофона
          setIsRecording(false);
          networkErrorCountRef.current = 0;
          toast({
            variant: "destructive",
            title: "Микрофон не найден",
            description: "Проверьте настройки браузера и подключение микрофона.",
          });
        } else if (event.error === 'not-allowed') {
          // Разрешение не предоставлено
          setIsRecording(false);
          networkErrorCountRef.current = 0;
          toast({
            variant: "destructive",
            title: "Доступ к микрофону запрещен",
            description: "Разрешите доступ к микрофону в настройках браузера.",
          });
        } else if (event.error === 'aborted') {
          // Распознавание было прервано - это нормально
          setIsRecording(false);
          networkErrorCountRef.current = 0;
        } else if (event.error === 'network') {
          // Ошибка сети - останавливаем и показываем сообщение
          networkErrorCountRef.current += 1;
          setIsRecording(false);
          
          // Останавливаем распознавание, чтобы избежать циклов
          try {
            recognition.stop();
          } catch (e) {
            // Игнорируем ошибки при остановке
          }
          
          // Показываем сообщение только при первой ошибке
          if (networkErrorCountRef.current === 1) {
            toast({
              variant: "destructive",
              title: "Ошибка подключения",
              description: "Не удалось подключиться к серверу распознавания речи. Проверьте интернет-соединение. Возможно, требуется VPN для доступа к серверам Google. Также попробуйте включить экспериментальные функции в Chrome: chrome://flags/#enable-experimental-web-platform-features",
              duration: 8000, // Показываем дольше для важного сообщения
            });
          }
        } else {
          console.error('Unknown speech recognition error:', event.error);
          setIsRecording(false);
          networkErrorCountRef.current = 0;
          // Показываем toast только для критических ошибок
          if (event.error !== 'service-not-allowed') {
            toast({
              variant: "destructive",
              title: "Ошибка распознавания речи",
              description: `Ошибка: ${event.error}. Проверьте подключение к интернету и попробуйте еще раз.`,
            });
          }
        }
      };

      recognition.onend = () => {
        setIsRecording(false);
        // Сохраняем финальный текст при остановке
        if (finalTranscriptRef.current) {
          setInput(finalTranscriptRef.current.trim());
        }
      };

      recognition.onstart = () => {
        console.log('Speech recognition started successfully');
        finalTranscriptRef.current = '';
        setInput('');
        networkErrorCountRef.current = 0; // Сбрасываем счетчик при успешном запуске
      };
      
      recognition.onnomatch = () => {
        console.log('Speech recognition: no match found');
        // Это не ошибка, просто нет совпадений
      };

      return recognition;
    } catch (error: any) {
      console.error('Error creating SpeechRecognition:', error);
      return null;
    }
  };

  useEffect(() => {
    // Инициализируем распознавание речи при монтировании компонента
    recognitionRef.current = createRecognition();

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // Игнорируем ошибки при остановке
        }
        recognitionRef.current = null;
      }
    };
  }, []);

  const toggleRecording = () => {
    // Проверяем поддержку API
    const hasWebkit = 'webkitSpeechRecognition' in window;
    const hasStandard = 'SpeechRecognition' in window;
    
    if (!hasWebkit && !hasStandard) {
      toast({
        variant: "destructive",
        title: "Браузер не поддерживается",
        description: "Голосовой ввод работает только в Chrome, Edge или Safari. В Chrome включите: chrome://flags/#enable-experimental-web-platform-features",
        duration: 6000,
      });
      return;
    }

    // Проверяем HTTPS (кроме localhost)
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      toast({
        variant: "destructive",
        title: "Требуется HTTPS",
        description: "Распознавание речи работает только по HTTPS или на localhost.",
      });
      return;
    }
    
    // Проверяем, что распознавание может быть создано
    const testRecognition = createRecognition();
    if (!testRecognition) {
      toast({
        variant: "destructive",
        title: "Ошибка инициализации",
        description: "Не удалось инициализировать распознавание речи. Попробуйте перезагрузить страницу или включить экспериментальные функции в Chrome.",
        duration: 6000,
      });
      return;
    }
    // Уничтожаем тестовый экземпляр
    try {
      testRecognition.abort();
    } catch (e) {
      // Игнорируем ошибки
    }

    if (isRecording) {
      // Останавливаем запись
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
          setIsRecording(false);
        } catch (error) {
          console.error('Error stopping recognition:', error);
          setIsRecording(false);
        }
      }
    } else {
      // Начинаем запись
      // Сбрасываем счетчик ошибок при новой попытке
      networkErrorCountRef.current = 0;
      
      try {
        // Пересоздаем экземпляр распознавания для надежности
        if (recognitionRef.current) {
          try {
            recognitionRef.current.stop();
          } catch (e) {
            // Игнорируем ошибки при остановке старого экземпляра
          }
        }
        
        recognitionRef.current = createRecognition();
        
        if (!recognitionRef.current) {
          toast({
            variant: "destructive",
            title: "Ошибка инициализации",
            description: "Не удалось инициализировать распознавание речи.",
          });
          return;
        }

        // Очищаем предыдущий текст при новом начале записи
        finalTranscriptRef.current = '';
        setInput('');
        
        recognitionRef.current.start();
        setIsRecording(true);
      } catch (error: any) {
        console.error('Error starting recognition:', error);
        setIsRecording(false);
        networkErrorCountRef.current = 0;
        
        // Обрабатываем ошибки запуска
        if (error.name === 'NotAllowedError' || error.message?.includes('not allowed')) {
          toast({
            variant: "destructive",
            title: "Доступ запрещен",
            description: "Разрешите доступ к микрофону в настройках браузера.",
          });
        } else if (error.name === 'NotFoundError' || error.message?.includes('not found')) {
          toast({
            variant: "destructive",
            title: "Микрофон не найден",
            description: "Проверьте подключение микрофона.",
          });
        } else if (error.name === 'InvalidStateError' || error.message?.includes('already started')) {
          // Распознавание уже запущено - пересоздаем
          console.log('Recognition already started, recreating...');
          recognitionRef.current = createRecognition();
          if (recognitionRef.current) {
            try {
              recognitionRef.current.start();
              setIsRecording(true);
            } catch (e: any) {
              console.error('Error restarting recognition:', e);
              toast({
                variant: "destructive",
                title: "Ошибка запуска",
                description: `Не удалось запустить распознавание речи: ${e.message || e.name || 'Неизвестная ошибка'}`,
              });
            }
          }
        } else {
          toast({
            variant: "destructive",
            title: "Ошибка запуска",
            description: `Не удалось запустить распознавание речи: ${error.message || error.name || 'Неизвестная ошибка'}. Попробуйте еще раз.`,
          });
        }
      }
    }
  };

  const handleSend = () => {
    if (!input.trim() || isSending) return;
    
    if (isRecording && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsRecording(false);
    }
    
    onSend(input.trim());
    setInput("");
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="rounded-t-3xl px-4 pb-safe">
        <SheetHeader className="pb-3">
          <SheetTitle className="text-base">Написать сообщение</SheetTitle>
        </SheetHeader>
        
        <div className="space-y-4">
          <div className="relative">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Спросите о рецепте или питании..."
              className="min-h-[80px] max-h-[150px] resize-none text-base rounded-2xl bg-card border-border/50 pr-12"
              rows={3}
            />
            {isRecording && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute top-3 right-3"
              >
                <span className="flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-destructive"></span>
                </span>
              </motion.div>
            )}
          </div>

          <div className="flex gap-3 justify-end">
            <Button
              variant={isRecording ? "destructive" : "outline"}
              size="icon"
              onClick={toggleRecording}
              className="h-12 w-12 rounded-xl"
            >
              {isRecording ? (
                <MicOff className="w-5 h-5" />
              ) : (
                <Mic className="w-5 h-5" />
              )}
            </Button>
            
            <Button
              variant="mint"
              onClick={handleSend}
              disabled={!input.trim() || isSending}
              className="h-12 px-6 rounded-xl"
            >
              {isSending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Send className="w-5 h-5 mr-2" />
                  Отправить
                </>
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
