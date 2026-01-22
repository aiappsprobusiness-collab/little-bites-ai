import { useState, useRef } from "react";
import { motion, AnimatePresence, PanInfo, useMotionValue, useTransform } from "framer-motion";
import { Trash2 } from "lucide-react";

interface ChatMessageProps {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  onDelete: (id: string) => void;
}

export function ChatMessage({ id, role, content, timestamp, onDelete }: ChatMessageProps) {
  const [showDelete, setShowDelete] = useState(false);
  const x = useMotionValue(0);
  const deleteOpacity = useTransform(x, [-100, -50, 0], [1, 0.5, 0]);
  const deleteScale = useTransform(x, [-100, -50, 0], [1, 0.8, 0.5]);
  const constraintsRef = useRef(null);

  const handleDragEnd = (_: any, info: PanInfo) => {
    if (info.offset.x < -80) {
      setShowDelete(true);
    }
  };

  const handleDelete = () => {
    onDelete(id);
    setShowDelete(false);
  };

  return (
    <div 
      ref={constraintsRef}
      className={`relative flex ${role === "user" ? "justify-end" : "justify-start"}`}
    >
      {/* Delete button background - visible on swipe */}
      <motion.div
        style={{ opacity: deleteOpacity, scale: deleteScale }}
        className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center justify-center w-16 h-16"
      >
        <div className="w-12 h-12 rounded-full bg-destructive/20 flex items-center justify-center">
          <Trash2 className="w-5 h-5 text-destructive" />
        </div>
      </motion.div>

      <motion.div
        drag="x"
        dragConstraints={{ left: -100, right: 0 }}
        dragElastic={0.1}
        onDragEnd={handleDragEnd}
        style={{ x }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, x: -100 }}
        className={`relative max-w-[85%] cursor-grab active:cursor-grabbing`}
      >
        <div
          className={`rounded-2xl px-4 py-3 ${
            role === "user"
              ? "bg-primary text-primary-foreground rounded-br-sm"
              : "bg-card shadow-soft rounded-bl-sm"
          }`}
        >
          <p className="text-base whitespace-pre-wrap select-none">{content}</p>
          <p className="text-[10px] opacity-60 mt-1">
            {timestamp.toLocaleTimeString("ru-RU", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
      </motion.div>

      {/* Delete confirmation popup */}
      <AnimatePresence>
        {showDelete && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/30 z-50"
              onClick={() => setShowDelete(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-card rounded-2xl p-6 shadow-xl flex flex-col items-center gap-4"
            >
              <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
                <Trash2 className="w-8 h-8 text-destructive" />
              </div>
              <p className="text-center font-medium">Удалить сообщение?</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDelete(false)}
                  className="px-6 py-2 rounded-xl bg-muted text-muted-foreground font-medium"
                >
                  Отмена
                </button>
                <button
                  onClick={handleDelete}
                  className="px-6 py-2 rounded-xl bg-destructive text-destructive-foreground font-medium"
                >
                  Удалить
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
