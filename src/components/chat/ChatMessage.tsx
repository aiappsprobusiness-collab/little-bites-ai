import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChatMessageProps {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  onDelete: (id: string) => void;
}

export function ChatMessage({ id, role, content, timestamp, onDelete }: ChatMessageProps) {
  const [showDelete, setShowDelete] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTouchStart = () => {
    longPressTimer.current = setTimeout(() => {
      setShowDelete(true);
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
  };

  const handleMouseDown = () => {
    longPressTimer.current = setTimeout(() => {
      setShowDelete(true);
    }, 500);
  };

  const handleMouseUp = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
  };

  const handleDelete = () => {
    onDelete(id);
    setShowDelete(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={`flex ${role === "user" ? "justify-end" : "justify-start"}`}
    >
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className="relative"
      >
        <div
          className={`max-w-[85%] rounded-2xl px-4 py-3 ${
            role === "user"
              ? "bg-primary text-primary-foreground rounded-br-sm"
              : "bg-card shadow-soft rounded-bl-sm"
          }`}
        >
          <p className="text-base whitespace-pre-wrap">{content}</p>
          <p className="text-[10px] opacity-60 mt-1">
            {timestamp.toLocaleTimeString("ru-RU", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>

        <AnimatePresence>
          {showDelete && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className={`absolute top-1/2 -translate-y-1/2 ${
                role === "user" ? "-left-12" : "-right-12"
              }`}
            >
              <Button
                variant="destructive"
                size="icon"
                onClick={handleDelete}
                className="h-9 w-9 rounded-full shadow-lg"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {showDelete && (
          <div
            className="fixed inset-0 z-[-1]"
            onClick={() => setShowDelete(false)}
          />
        )}
      </div>
    </motion.div>
  );
}
