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
  const [input, setInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const finalTranscriptRef = useRef<string>('');

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    // Initialize speech recognition
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognitionClass();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'ru-RU';

      recognitionRef.current.onresult = (event: any) => {
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

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsRecording(false);
        
        // Обрабатываем различные типы ошибок
        if (event.error === 'no-speech') {
          // Пользователь не говорил - это нормально, просто останавливаем
          setIsRecording(false);
        } else if (event.error === 'audio-capture') {
          // Нет микрофона
          alert('Микрофон не найден. Проверьте настройки браузера.');
        } else if (event.error === 'not-allowed') {
          // Разрешение не предоставлено
          alert('Разрешение на использование микрофона не предоставлено. Проверьте настройки браузера.');
        }
      };

      recognitionRef.current.onend = () => {
        setIsRecording(false);
        // Сохраняем финальный текст при остановке
        if (finalTranscriptRef.current) {
          setInput(finalTranscriptRef.current.trim());
        }
      };

      recognitionRef.current.onstart = () => {
        finalTranscriptRef.current = '';
        setInput('');
      };
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // Игнорируем ошибки при остановке
        }
      }
    };
  }, []);

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      // Проверяем поддержку API
      if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
        alert('Голосовой ввод не поддерживается в вашем браузере. Используйте Chrome, Edge или Safari.');
        return;
      }
      console.error('Speech recognition not initialized');
      return;
    }

    if (isRecording) {
      try {
        recognitionRef.current.stop();
        setIsRecording(false);
      } catch (error) {
        console.error('Error stopping recognition:', error);
        setIsRecording(false);
      }
    } else {
      try {
        // Очищаем предыдущий текст при новом начале записи
        setInput('');
        recognitionRef.current.start();
        setIsRecording(true);
      } catch (error: any) {
        console.error('Error starting recognition:', error);
        setIsRecording(false);
        
        // Обрабатываем ошибки запуска
        if (error.name === 'NotAllowedError' || error.message?.includes('not allowed')) {
          alert('Разрешение на использование микрофона не предоставлено. Проверьте настройки браузера.');
        } else if (error.name === 'NotFoundError' || error.message?.includes('not found')) {
          alert('Микрофон не найден. Проверьте подключение микрофона.');
        } else {
          alert('Не удалось запустить распознавание речи. Попробуйте еще раз.');
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
