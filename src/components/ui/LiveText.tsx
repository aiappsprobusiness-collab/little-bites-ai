/**
 * LiveText - Компонент для отображения текста в реальном времени (streaming)
 * Аналог LiveText composable для Android
 */

import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";

interface LiveTextProps {
  content: string;
  className?: string;
  showCursor?: boolean;
  onComplete?: () => void;
}

export function LiveText({ 
  content, 
  className = "", 
  showCursor = true,
  onComplete 
}: LiveTextProps) {
  const [displayedContent, setDisplayedContent] = useState("");
  const [isComplete, setIsComplete] = useState(false);
  const prevContentRef = useRef("");

  useEffect(() => {
    // Если контент изменился, обновляем отображаемый текст
    if (content !== prevContentRef.current) {
      setDisplayedContent(content);
      prevContentRef.current = content;
      
      // Если контент закончился, вызываем callback
      if (content && !isComplete) {
        setIsComplete(true);
        if (onComplete) {
          // Небольшая задержка для плавности
          setTimeout(() => onComplete(), 100);
        }
      }
    }
  }, [content, isComplete, onComplete]);

  return (
    <div className={`relative ${className}`}>
      <span>{displayedContent}</span>
      {showCursor && !isComplete && (
        <motion.span
          animate={{ opacity: [1, 0] }}
          transition={{ duration: 0.8, repeat: Infinity, repeatType: "reverse" }}
          className="inline-block w-0.5 h-4 bg-primary ml-1 align-middle"
        />
      )}
    </div>
  );
}

/**
 * LiveTextStream - Компонент для потокового отображения текста с анимацией печати
 */
interface LiveTextStreamProps {
  stream: ReadableStream<Uint8Array> | null;
  className?: string;
  onComplete?: (fullContent: string) => void;
  onError?: (error: Error) => void;
}

export function LiveTextStream({
  stream,
  className = "",
  onComplete,
  onError,
}: LiveTextStreamProps) {
  const [content, setContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  useEffect(() => {
    if (!stream) return;

    setIsStreaming(true);
    setContent("");

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const readChunk = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            // Обрабатываем оставшийся буфер
            if (buffer.trim()) {
              const lines = buffer.split("\n");
              for (const line of lines) {
                if (line.trim() && line.startsWith("data: ")) {
                  try {
                    const jsonStr = line.replace("data: ", "");
                    if (jsonStr === "[DONE]") {
                      setIsStreaming(false);
                      if (onComplete) {
                        onComplete(content);
                      }
                      return;
                    }
                    const data = JSON.parse(jsonStr);
                    if (data.choices?.[0]?.delta?.content) {
                      const newContent = content + data.choices[0].delta.content;
                      setContent(newContent);
                    }
                  } catch (e) {
                    // Игнорируем ошибки парсинга
                  }
                }
              }
            }
            setIsStreaming(false);
            if (onComplete) {
              onComplete(content);
            }
            break;
          }

          // Декодируем chunk
          buffer += decoder.decode(value, { stream: true });
          
          // Обрабатываем полные строки
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.trim() && line.startsWith("data: ")) {
              try {
                const jsonStr = line.replace("data: ", "");
                if (jsonStr === "[DONE]") {
                  setIsStreaming(false);
                  if (onComplete) {
                    onComplete(content);
                  }
                  return;
                }
                const data = JSON.parse(jsonStr);
                if (data.choices?.[0]?.delta?.content) {
                  setContent((prev) => prev + data.choices[0].delta.content);
                }
              } catch (e) {
                // Игнорируем ошибки парсинга отдельных chunks
              }
            }
          }
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        setIsStreaming(false);
        if (onError) {
          onError(err);
        }
      } finally {
        reader.releaseLock();
      }
    };

    readChunk();

    return () => {
      reader.cancel();
    };
  }, [stream, onComplete, onError]);

  return (
    <LiveText
      content={content}
      className={className}
      showCursor={isStreaming}
      onComplete={() => {
        if (!isStreaming && onComplete) {
          onComplete(content);
        }
      }}
    />
  );
}
