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
import { 
  SpeechRecognitionService, 
  checkMicrophonePermission, 
  requestMicrophonePermission,
  getAvailableMethods 
} from "@/services/speechToTextEnhanced";

// Extend window for TypeScript
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

interface ChatInputPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (message: string) => void;
  isSending: boolean;
}

export function ChatInputPanel({ isOpen, onClose, onSend, isSending }: ChatInputPanelProps) {
  const { toast } = useToast();
  const [input, setInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const speechServiceRef = useRef<SpeechRecognitionService | null>(null);
  const finalTranscriptRef = useRef<string>('');

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Очистка при размонтировании
  useEffect(() => {
    return () => {
      if (speechServiceRef.current) {
        speechServiceRef.current.destroy();
        speechServiceRef.current = null;
      }
    };
  }, []);

  const toggleRecording = async () => {
    if (isRecording) {
      // Останавливаем запись
      if (speechServiceRef.current) {
        try {
          speechServiceRef.current.stop();
        } catch (error) {
          console.error('Error stopping recognition:', error);
        }
        setIsRecording(false);
      }
      return;
    }

    // Начинаем запись с проверкой разрешений
    setIsInitializing(true);
    console.log('Starting speech recognition...');

    try {
      // Проверяем доступность методов сначала
      const availableMethods = getAvailableMethods();
      console.log('Available methods:', availableMethods);
      
      if (availableMethods.length === 0) {
        toast({
          variant: "destructive",
          title: "Не поддерживается",
          description: "Распознавание речи не поддерживается в этом браузере/устройстве. Используйте Chrome, Edge или Safari.",
          duration: 6000,
        });
        setIsInitializing(false);
        return;
      }

      // Проверяем разрешения
      console.log('Checking microphone permission...');
      const hasPermission = await checkMicrophonePermission();
      console.log('Has permission:', hasPermission);
      
      if (!hasPermission) {
        console.log('Requesting microphone permission...');
        const granted = await requestMicrophonePermission();
        console.log('Permission granted:', granted);
        
        if (!granted) {
          toast({
            variant: "destructive",
            title: "Доступ запрещен",
            description: "Необходимо разрешение на использование микрофона для голосового ввода. Разрешите доступ в настройках браузера.",
            duration: 5000,
          });
          setIsInitializing(false);
          return;
        }
      }

      // Создаем или пересоздаем сервис
      if (speechServiceRef.current) {
        speechServiceRef.current.destroy();
      }

      console.log('Creating speech recognition service...');
      const service = new SpeechRecognitionService({
        language: 'ru-RU',
        continuous: true,
        interimResults: true,
        maxAlternatives: 1,
        onResult: (result) => {
          console.log('Speech recognition result:', result);
          if (result.isFinal) {
            finalTranscriptRef.current += result.text + ' ';
          }
          setInput((finalTranscriptRef.current + (result.isFinal ? '' : result.text)).trim());
        },
        onError: (error) => {
          console.error('Speech recognition error:', error);
          setIsRecording(false);
          
          let errorMessage = error.error;
          if (error.code === 'network') {
            // Более понятное сообщение
            errorMessage = 'Web Speech API не может подключиться к серверам Google. Это может быть из-за блокировки доступа к Google или проблем с интернетом.';
            
            // Показываем дополнительное уведомление с решениями
            setTimeout(() => {
              toast({
                title: "Решения проблемы",
                description: "1) Используйте VPN для доступа к Google\n2) Введите текст вручную (кнопка микрофона не обязательна)\n3) Используйте Android приложение - оно работает офлайн",
                duration: 10000,
              });
            }, 1000);
          } else if (error.code === 'not-allowed') {
            errorMessage = 'Доступ к микрофону запрещен. Разрешите доступ в настройках браузера (иконка замка в адресной строке).';
          } else if (error.code === 'audio-capture') {
            errorMessage = 'Микрофон не найден. Проверьте подключение микрофона и настройки системы.';
          }

          toast({
            variant: "destructive",
            title: "Ошибка распознавания",
            description: errorMessage,
            duration: 5000,
          });
        },
        onEnd: () => {
          console.log('Speech recognition ended');
          setIsRecording(false);
          if (finalTranscriptRef.current) {
            setInput(finalTranscriptRef.current.trim());
          }
        },
      });
      speechServiceRef.current = service;

      // Инициализируем распознавание
      console.log('Initializing speech recognition...');
      const initResult = await speechServiceRef.current.initialize();
      console.log('Initialization result:', initResult);
      
      if (!initResult.success) {
        toast({
          variant: "destructive",
          title: "Ошибка инициализации",
          description: initResult.error || "Не удалось инициализировать распознавание речи.",
          duration: 5000,
        });
        setIsInitializing(false);
        return;
      }

      // Начинаем запись
      console.log('Starting speech recognition...');
      finalTranscriptRef.current = '';
      setInput('');
      await speechServiceRef.current.start();
      setIsRecording(true);
      setIsInitializing(false);

      console.log('Speech recognition started successfully');
    } catch (error: any) {
      console.error('Error starting recognition:', error);
      setIsRecording(false);
      setIsInitializing(false);
      
      toast({
        variant: "destructive",
        title: "Ошибка запуска",
        description: error.message || "Не удалось запустить распознавание речи. Попробуйте еще раз или введите текст вручную.",
        duration: 5000,
      });
    }
  };

  const handleSend = () => {
    if (!input.trim() || isSending) return;
    
    if (isRecording && speechServiceRef.current) {
      speechServiceRef.current.stop();
      setIsRecording(false);
    }
    
    onSend(input.trim());
    setInput("");
    finalTranscriptRef.current = '';
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
              disabled={isInitializing}
              className="h-12 w-12 rounded-xl"
              title={isRecording ? "Остановить запись" : isInitializing ? "Инициализация..." : "Начать голосовой ввод"}
            >
              {isInitializing ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : isRecording ? (
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
